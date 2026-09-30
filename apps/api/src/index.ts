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

// Middleware
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// HTTP & Socket.IO server setup
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

app.set("io", io);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/social", socialRoutes);

// Root health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

io.on("connection", (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  // Join personal investigator channel
  socket.on("join_user", (userId: string) => {
    if (!userId) return;
    const roomName = `user:${userId}`;
    socket.join(roomName);
    console.log(`[Socket.IO] User ${userId} bound to channel: ${roomName}`);
  });

  // Typing telemetry relay
  socket.on(
    "typing_start",
    (payload: { senderId: string; receiverId: string; senderCallsign?: string }) => {
      if (!payload?.receiverId) return;
      console.log(
        `[Socket.IO] Typing START from ${payload.senderId} -> user:${payload.receiverId}`,
      );
      io.to(`user:${payload.receiverId}`).emit("peer_typing", {
        senderId: payload.senderId,
        senderCallsign: payload.senderCallsign || "Operator",
      });
    },
  );

  socket.on("typing_stop", (payload: { senderId: string; receiverId: string }) => {
    if (!payload?.receiverId) return;
    console.log(`[Socket.IO] Typing STOP from ${payload.senderId} -> user:${payload.receiverId}`);
    io.to(`user:${payload.receiverId}`).emit("peer_stop_typing", {
      senderId: payload.senderId,
    });
  });

  // Read receipts acknowledgment
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
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// Raw TCP Hardware Ingestion Server (ESP32 telemetry stream)
const tcpServer = net.createServer((socket) => {
  console.log(
    `[TCP Sensor Bridge] ESP32 hardware connected from: ${socket.remoteAddress}:${socket.remotePort}`,
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
      } catch (err) {
        console.error("[TCP Sensor Bridge] JSON Parse Warning on packet:", trimmed);
      }
    }
  });

  socket.on("error", (err) => {
    console.error(
      `[TCP Sensor Bridge] Socket connection error (${socket.remoteAddress}):`,
      err.message,
    );
  });

  socket.on("close", () => {
    console.log(`[TCP Sensor Bridge] ESP32 hardware disconnected: ${socket.remoteAddress}`);
  });
});

tcpServer.on("error", (err: any) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[TCP Sensor Bridge] FATAL: Port ${TCP_PORT} is locked by another process.`);
    console.error(`Run: "sudo fuser -k ${TCP_PORT}/tcp" or change TCP_PORT in apps/api/.env.\n`);
  } else {
    console.error("[TCP Sensor Bridge] Server runtime error:", err);
  }
});

httpServer.on("error", (err: any) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[Web Server] FATAL: Web port ${WEB_PORT} is already in use.\n`);
  } else {
    console.error("[Web Server] Runtime error:", err);
  }
});

httpServer.listen(WEB_PORT, "0.0.0.0", () => {
  console.log(`AetherStream Core Web & Socket server online on port ${WEB_PORT}`);
});

tcpServer.listen(TCP_PORT, "0.0.0.0", () => {
  console.log(`AetherStream Hardware TCP Ingestion online on port ${TCP_PORT}`);
});

const cleanShutdown = () => {
  console.log("Closing AetherStream network listeners cleanly...");
  tcpServer.close(() => console.log("TCP Port closed."));
  httpServer.close(() => {
    console.log("Web Port closed.");
    process.exit(0);
  });
};

process.on("SIGINT", cleanShutdown);
process.on("SIGTERM", cleanShutdown);
