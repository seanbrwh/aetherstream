import express from "express";
import http from "http";
import net from "net";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import { Server as SocketIOServer } from "socket.io";

import authRoutes from "./routes/auth.routes.js";
import deviceRoutes from "./routes/device.routes.js";
import socialRoutes from "./routes/social.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Create the unified HTTP server for Express and Socket.IO
const httpServer = http.createServer(app);

// Initialize Socket.IO with permissive CORS for local development
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

const apiRouter = express.Router();

apiRouter.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

apiRouter.use("/auth", authRoutes);
apiRouter.use("/devices", deviceRoutes);
apiRouter.use("/social", socialRoutes);

app.use("/api", apiRouter);

const frontendDistPath = path.join(__dirname, "../../web/dist");
app.use(express.static(frontendDistPath));

app.get(/.*$/, (req, res) => {
  res.sendFile(path.join(frontendDistPath, "index.html"));
});

// Socket.IO connection handling for browser clients
io.on("connection", (socket) => {
  console.log(`[Socket.IO] React client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`[Socket.IO] React client disconnected: ${socket.id}`);
  });
});

// TCP Server for ESP32 Hardware Ingestion
const TCP_PORT = 8081;
const tcpServer = net.createServer((socket) => {
  console.log(`[TCP] ESP32 node connected: ${socket.remoteAddress}:${socket.remotePort}`);
  let buffer = "";

  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    const parts = buffer.split("\n");

    // Retain the trailing piece; if the chunk ended in '\n', parts.pop() will be empty string
    buffer = parts.pop() || "";

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed !== "") {
        try {
          const sensorData = JSON.parse(trimmed);
          // Broadcast parsed telemetry immediately to all connected browsers
          io.emit("sensor_update", sensorData);
        } catch (err) {
          console.error("[TCP] Malformed JSON received from hardware node:", trimmed);
        }
      }
    }
  });

  socket.on("close", () => {
    console.log("[TCP] ESP32 node disconnected");
  });

  socket.on("error", (err) => {
    console.error(`[TCP] Node socket error: ${err.message}`);
  });
});

tcpServer.listen(TCP_PORT, "0.0.0.0", () => {
  console.log(`AetherStream Hardware TCP Ingestion online on port ${TCP_PORT}`);
});

const HTTP_PORT = process.env.PORT || 3030;
httpServer.listen(HTTP_PORT, () => {
  console.log(`AetherStream Core Web & Socket server online on port ${HTTP_PORT}`);
});
