import express from "express";
import http from "http";
import net from "net";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Server as SocketIOServer } from "socket.io";
import { prisma } from "./db.js";
import authRoutes from "./routes/auth.routes.js";
import socialRoutes from "./routes/social.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const WEB_PORT = Number(process.env.PORT) || 3030;
const TCP_PORT = Number(process.env.TCP_PORT) || 8081;

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

app.set("io", io);

app.use("/api/auth", authRoutes);
app.use("/api/social", socialRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Live Squad Presence Store: socketId -> operator metadata
interface OnlineOperator {
  userId: string;
  socketId: string;
  username: string;
  displayName: string | null;
  callsign: string | null;
  role: string | null;
  status: "active" | "idle";
  lastActivity: number;
}

const onlineOperators = new Map<string, OnlineOperator>();

const broadcastPresence = () => {
  const uniqueUsers = new Map<string, OnlineOperator>();
  for (const op of onlineOperators.values()) {
    uniqueUsers.set(op.userId, op);
  }
  io.emit("operators_online", Array.from(uniqueUsers.values()));
};

// Anomaly Alert Cooldown Timers (Prevents 6Hz TCP packet spam)
const ALERT_COOLDOWN_MS = 60 * 1000; // 60 second minimum interval per alert type
const lastAlertTimes = {
  temp: 0,
  seismic: 0,
  proximity: 0,
};

io.on("connection", (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  socket.on("join_user", async (userId: string) => {
    if (!userId) return;
    const roomName = `user:${userId}`;
    socket.join(roomName);

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          callsign: true,
          role: true,
        },
      });

      if (user) {
        onlineOperators.set(socket.id, {
          userId: user.id,
          socketId: socket.id,
          username: user.username || "operator",
          displayName: user.displayName,
          callsign: user.callsign,
          role: user.role,
          status: "active",
          lastActivity: Date.now(),
        });
        broadcastPresence();
      }
    } catch (err) {
      console.error("[Presence] Error registering user presence:", err);
    }
  });

  // Squad / Group socket channel binding
  socket.on("join_squad", (squadId: string) => {
    if (!squadId) return;
    socket.join(`squad:${squadId}`);
    console.log(`[Socket.IO] Client ${socket.id} joined squad channel: squad:${squadId}`);
  });

  socket.on("squad_message", (payload: any) => {
    if (!payload?.squadId) return;
    io.to(`squad:${payload.squadId}`).emit("new_squad_message", payload);
  });

  socket.on("operator_status_change", (status: "active" | "idle") => {
    const op = onlineOperators.get(socket.id);
    if (op) {
      op.status = status;
      op.lastActivity = Date.now();
      broadcastPresence();
    }
  });

  socket.on(
    "typing_start",
    (payload: { senderId: string; receiverId: string; senderCallsign?: string }) => {
      if (!payload?.receiverId) return;
      io.to(`user:${payload.receiverId}`).emit("peer_typing", {
        senderId: payload.senderId,
        senderCallsign: payload.senderCallsign || "Operator",
      });
    },
  );

  socket.on("typing_stop", (payload: { senderId: string; receiverId: string }) => {
    if (!payload?.receiverId) return;
    io.to(`user:${payload.receiverId}`).emit("peer_stop_typing", {
      senderId: payload.senderId,
    });
  });

  socket.on("mark_read", async (payload: { readerId: string; senderId: string }) => {
    try {
      const { readerId, senderId } = payload;
      if (!readerId || !senderId) return;

      const readTimestamp = new Date();

      await prisma.message.updateMany({
        where: {
          senderId,
          receiverId: readerId,
          readAt: null,
        },
        data: {
          readAt: readTimestamp,
        },
      });

      io.to(`user:${senderId}`).emit("messages_read_receipt", {
        readerId,
        readAt: readTimestamp,
      });
    } catch (err) {
      console.error("[Socket.IO] mark_read error:", err);
    }
  });

  socket.on("disconnect", () => {
    onlineOperators.delete(socket.id);
    broadcastPresence();
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// Raw TCP Hardware Bridge on Port 8081
const tcpServer = net.createServer((socket) => {
  console.log(
    `[TCP Sensor Bridge] ESP32 hardware connected: ${socket.remoteAddress}:${socket.remotePort}`,
  );

  let buffer = "";

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const payload = JSON.parse(trimmed);
        io.emit("sensor_update", payload);

        // Anomaly Evaluation with Debounce Cooldown
        const now = Date.now();
        const rawTempC = payload.sensors?.environment?.temp_c;
        const tempF = rawTempC !== undefined ? rawTempC * 1.8 + 32 : 72;
        const peakG = payload.sensors?.mpu6050?.peak_g || 0;
        const cap = payload.sensors?.mpr121?.capacitance || 0;

        // Rapid Cold Drop Alert (Below 69.5°F, once per 60s max)
        if (tempF < 69.5 && now - lastAlertTimes.temp > ALERT_COOLDOWN_MS) {
          lastAlertTimes.temp = now;
          io.emit("hardware_anomaly_alert", {
            id: `temp-${now}`,
            type: "ANOMALY",
            title: "Cold Spot Detected",
            content: `Atmospheric drop to ${tempF.toFixed(1)}°F registered by station sensors.`,
            createdAt: new Date().toISOString(),
          });
        }
        // Impact / Shock Alert (> 0.20 G force, once per 60s max)
        else if (peakG > 0.2 && now - lastAlertTimes.seismic > ALERT_COOLDOWN_MS) {
          lastAlertTimes.seismic = now;
          io.emit("hardware_anomaly_alert", {
            id: `geo-${now}`,
            type: "ANOMALY",
            title: "Seismic Impact Spike",
            content: `Vibration spike of ${peakG.toFixed(3)} G force detected on station mount.`,
            createdAt: new Date().toISOString(),
          });
        }
        // REM Proximity Surge (> 160 capacitive delta, once per 60s max)
        else if (cap > 160 && now - lastAlertTimes.proximity > ALERT_COOLDOWN_MS) {
          lastAlertTimes.proximity = now;
          io.emit("hardware_anomaly_alert", {
            id: `rem-${now}`,
            type: "ANOMALY",
            title: "Proximity Field Spike",
            content: `Capacitive disturbance field surged to ${cap} mG on REM antenna.`,
            createdAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error("[TCP Sensor Bridge] Warning on packet:", trimmed);
      }
    }
  });

  socket.on("error", (err) => {
    console.error("[TCP Sensor Bridge] Socket connection error:", err.message);
  });

  socket.on("close", () => {
    console.log("[TCP Sensor Bridge] Hardware disconnected");
  });
});

tcpServer.on("error", (err: any) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[TCP Sensor Bridge] Port ${TCP_PORT} is in use.\n`);
  } else {
    console.error("[TCP Sensor Bridge] Server runtime error:", err);
  }
});

httpServer.listen(WEB_PORT, "0.0.0.0", () => {
  console.log(`AetherStream Core Web & Socket server running on port ${WEB_PORT}`);
});

tcpServer.listen(TCP_PORT, "0.0.0.0", () => {
  console.log(`AetherStream Hardware TCP Ingestion running on port ${TCP_PORT}`);
});

const cleanShutdown = () => {
  tcpServer.close(() => console.log("TCP Port closed."));
  httpServer.close(() => {
    console.log("Web Port closed.");
    process.exit(0);
  });
};

process.on("SIGINT", cleanShutdown);
process.on("SIGTERM", cleanShutdown);
