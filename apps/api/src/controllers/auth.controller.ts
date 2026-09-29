import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { prisma } from "../db.js";

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_key";

const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const register = async (req: Request, res: Response): Promise<void> => {
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
};

export const login = async (req: Request, res: Response): Promise<void> => {
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
};

export const recover = async (req: Request, res: Response): Promise<void> => {
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

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      await mailer.sendMail({
        from: `"AetherStream Security" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "AetherStream Password Recovery",
        text: `Your password reset token is: ${resetToken}\n\nThis token expires in 1 hour.`,
      });
    }

    res.json({ message: "If that email exists, a recovery token has been generated." });
  } catch (error) {
    console.error("Recover Error:", error);
    res.status(500).json({ error: "Failed to process recovery" });
  }
};

export const reset = async (req: Request, res: Response): Promise<void> => {
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
};
