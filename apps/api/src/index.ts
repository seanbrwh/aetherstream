import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";

// Import our new modular route handlers
import authRoutes from "./routes/auth.routes";
import deviceRoutes from "./routes/device.routes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security and middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

const apiRouter = express.Router();

// Health Check
apiRouter.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount the modular MVC Routes
apiRouter.use("/auth", authRoutes);
apiRouter.use("/devices", deviceRoutes);

// Base API prefix
app.use("/api", apiRouter);

// Static Frontend Serving for Production
const frontendDistPath = path.join(__dirname, "../../web/dist");
app.use(express.static(frontendDistPath));

// Catch-all route to serve React Router (bypassing Express 5 regex constraints)
app.get(/.*$/, (req, res) => {
  res.sendFile(path.join(frontendDistPath, "index.html"));
});

const PORT = process.env.PORT || 3030;
app.listen(PORT, () => {
  console.log(`AetherStream Core online on port ${PORT}`);
});
