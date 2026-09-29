import express from "express";
import { createDevice, getDevices } from "../controllers/device.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/", authenticateToken, createDevice);
router.get("/", authenticateToken, getDevices);

export default router;
