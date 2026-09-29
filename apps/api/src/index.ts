import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";

// Modular route handlers
import authRoutes from "./routes/auth.routes.js";
import deviceRoutes from "./routes/device.routes.js";
import socialRoutes from "./routes/social.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

const apiRouter = express.Router();

apiRouter.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount the modular MVC Routes
apiRouter.use("/auth", authRoutes);
apiRouter.use("/devices", deviceRoutes);
apiRouter.use("/social", socialRoutes); // <-- 2. Mount Social Routes

app.use("/api", apiRouter);

const frontendDistPath = path.join(__dirname, "../../web/dist");
app.use(express.static(frontendDistPath));

app.get(/.*$/, (req, res) => {
  res.sendFile(path.join(frontendDistPath, "index.html"));
});

const PORT = process.env.PORT || 3030;
app.listen(PORT, () => {
  console.log(`AetherStream Core online on port ${PORT}`);
});
