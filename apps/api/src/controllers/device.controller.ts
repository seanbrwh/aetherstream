import { Request, Response } from "express";
import { prisma } from "../db.js";

export const createDevice = async (req: Request, res: Response): Promise<void> => {
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
};

export const getDevices = async (req: Request, res: Response): Promise<void> => {
  try {
    const devices = await prisma.device.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(devices);
  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({ error: "Failed to fetch devices" });
  }
};
