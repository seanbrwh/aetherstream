import express from "express";
import {
  createPost,
  getFeed,
  createComment,
  toggleLike,
  getInvestigators,
  getConversations,
  sendDirectMessage,
  getDirectMessages,
  markMessagesAsRead,
  getProfile,
  updateProfile,
} from "../controllers/social.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { uploadMedia } from "../middleware/upload.middleware.js";

const router = express.Router();

router.get("/feed", authenticateToken, getFeed);
router.get("/profile", authenticateToken, getProfile);
router.put("/profile", authenticateToken, updateProfile);

router.post("/posts", authenticateToken, uploadMedia, createPost);
router.post("/posts/:postId/comments", authenticateToken, createComment);
router.post("/posts/:postId/like", authenticateToken, toggleLike);

// Field Communications & Messaging Routes
router.get("/investigators", authenticateToken, getInvestigators);
router.get("/conversations", authenticateToken, getConversations);
router.get("/messages/:userId", authenticateToken, getDirectMessages);
router.post("/messages", authenticateToken, sendDirectMessage);
router.put("/messages/:userId/read", authenticateToken, markMessagesAsRead);

export default router;
