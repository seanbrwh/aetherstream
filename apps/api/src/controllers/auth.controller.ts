import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../db.js";

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_key_for_development";

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, username, callsign } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: "An account with this email already exists." });
      return;
    }

    const generatedUsername =
      username && username.trim() !== ""
        ? username.trim().toLowerCase()
        : email.split("@")[0].toLowerCase() + Math.floor(100 + Math.random() * 900);

    const existingUsername = await prisma.user.findUnique({
      where: { username: generatedUsername },
    });

    if (existingUsername) {
      res.status(400).json({ error: "This username is already taken. Please choose another." });
      return;
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUser = await prisma.user.create({
      data: {
        email,
        username: generatedUsername,
        displayName: generatedUsername,
        callsign: callsign ? callsign.trim().toUpperCase() : null,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        callsign: true,
        role: true,
        createdAt: true,
      },
    });

    const token = jwt.sign({ userId: newUser.id, username: newUser.username }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      message: "Investigator registered successfully.",
      token,
      user: newUser,
    });
  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ error: "Registration failed due to an internal server error." });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, email, password } = req.body;
    const loginTarget = identifier || email;

    if (!loginTarget || !password) {
      res.status(400).json({ error: "Email or username and password are required." });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: loginTarget }, { username: loginTarget.toLowerCase() }],
      },
    });

    if (!user) {
      res.status(401).json({ error: "Invalid credentials provided." });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: "Invalid credentials provided." });
      return;
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName || user.username,
        callsign: user.callsign,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Login failed due to an internal server error." });
  }
};

export const recover = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, identifier } = req.body;
    const target = email || identifier;

    if (!target) {
      res.status(400).json({ error: "Email or username is required for recovery." });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: target }, { username: target.toLowerCase() }],
      },
    });

    if (!user) {
      res.status(200).json({ message: "If an account exists, a recovery token has been issued." });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour validity

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });

    console.log(`[AUTH RECOVERY] Reset token for ${user.username || user.email}: ${resetToken}`);

    res.status(200).json({
      message: "Recovery token generated successfully.",
      resetToken,
    });
  } catch (error) {
    console.error("Password Recovery Error:", error);
    res.status(500).json({ error: "Password recovery failed due to an internal server error." });
  }
};

export const reset = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, newPassword, password } = req.body;
    const targetPassword = newPassword || password;

    if (!token || !targetPassword) {
      res.status(400).json({ error: "Reset token and new password are required." });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      res.status(400).json({ error: "Invalid or expired password reset token." });
      return;
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(targetPassword, saltRounds);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    res.status(200).json({ message: "Password has been successfully updated." });
  } catch (error) {
    console.error("Password Reset Error:", error);
    res.status(500).json({ error: "Password reset failed due to an internal server error." });
  }
};
