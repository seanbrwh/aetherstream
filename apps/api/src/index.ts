import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer"; // <-- 1. Import Nodemailer

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_key";

// -- 2. CONFIGURE EMAIL TRANSPORT --
const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

const apiRouter = express.Router();

// -- AUTH MIDDLEWARE --
const authenticateToken = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ error: "Access denied. No token provided." });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      res.status(403).json({ error: "Invalid or expired token." });
      return;
    }
    (req as any).user = user;
    next();
  });
};

// -- PUBLIC ROUTES --
apiRouter.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

apiRouter.post("/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      res.status(400).json({ error: "User already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: { email, passwordHash },
    });

    res.json({ message: "User registered successfully", userId: newUser.id });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ error: "Failed to register user" });
  }
});

apiRouter.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

apiRouter.post("/auth/recover", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      res.json({ message: "If that email exists, a recovery token has been generated." });
      return;
    }

    const resetToken = Math.random().toString(16).substring(2, 8).toUpperCase();
    const resetTokenExpiry = new Date(Date.now() + 3600000);

    await prisma.user.update({
      where: { email },
      data: { resetToken, resetTokenExpiry },
    });

    // -- 3. DISPATCH THE EMAIL --
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      await mailer.sendMail({
        from: `"AetherStream Security" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "AetherStream Password Recovery",
        text: `Your password reset token is: ${resetToken}\n\nThis token expires in 1 hour.`,
      });
    }

    // We remove the devOnlyToken from the response so it is no longer exposed to the frontend
    res.json({ message: "If that email exists, a recovery token has been generated." });
  } catch (error) {
    console.error("Recover Error:", error);
    res.status(500).json({ error: "Failed to process recovery" });
  }
});

apiRouter.post("/auth/reset", async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (
      !user ||
      user.resetToken !== resetToken ||
      !user.resetTokenExpiry ||
      user.resetTokenExpiry < new Date()
    ) {
      res.status(400).json({ error: "Invalid or expired reset token" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset Error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// -- PROTECTED ROUTES --
apiRouter.post("/devices", authenticateToken, async (req, res) => {
  try {
    const newDevice = await prisma.device.create({
      data: {
        name: req.body.name || `ESP32_NODE_${Math.floor(Math.random() * 1000)}`,
      },
    });
    res.json(newDevice);
  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({ error: "Failed to create device" });
  }
});

apiRouter.get("/devices", authenticateToken, async (req, res) => {
  try {
    const devices = await prisma.device.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(devices);
  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

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
