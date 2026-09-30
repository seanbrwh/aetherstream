import express from "express";
import {
  createPost,
  getFeed,
  createComment,
  getProfile,
} from "../controllers/social.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { uploadMedia } from "../middleware/upload.middleware.js";

const router = express.Router();

router.get("/feed", authenticateToken, getFeed);
router.get("/profile", authenticateToken, getProfile);

router.post("/posts", authenticateToken, uploadMedia, createPost);
router.post("/posts/:postId/comments", authenticateToken, createComment);

export default router;
