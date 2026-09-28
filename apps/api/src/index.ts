import cors from "cors";
import { config as loadEnv } from "dotenv";
import express from "express";
import fs from "node:fs";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const connectionString = process.env.DATABASE_URL;

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.use(cors());
app.use(express.json());

const apiRouter = express.Router();

apiRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "AetherStream API",
  });
});

apiRouter.post("/devices", async (req, res) => {
  try {
    const newDevice = await prisma.device.create({
      data: {
        name: req.body.name || `ESP32_NODE_${Math.floor(Math.random() * 1000)}`,
      },
    });
    res.json(newDevice);
  } catch (error) {
    console.error("Error creating device:", error);
    res.status(500).json({ error: "Failed to create device" });
  }
});

// 4. Add Route to Fetch All Devices
apiRouter.get("/devices", async (req, res) => {
  try {
    const devices = await prisma.device.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(devices);
  } catch (error) {
    console.error("Error fetching devices:", error);
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

app.use("/api", apiRouter);

const frontendDistPath = path.join(__dirname, "../../web/dist");
app.use(express.static(frontendDistPath));

app.get("/*splat", (_req, res) => {
  const indexPath = path.join(frontendDistPath, "index.html");
  if (!fs.existsSync(indexPath)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.sendFile(indexPath);
});

const PORT = Number(process.env.PORT) || 3030;
app.listen(PORT, () => {
  console.log(`AetherStream Core online on port ${PORT}`);
});
