import express from "express";
import {
  createPost,
  getFeed,
  createComment,
  toggleLike,
  toggleFollow,
  getInvestigators,
  getPublicProfile,
  getUserFollowers,
  getUserFollowing,
  getConversations,
  sendDirectMessage,
  getDirectMessages,
  markMessagesAsRead,
  getProfile,
  updateProfile,
  getNotifications,
  markNotificationsAsRead,
  createSquad,
  getMySquads,
  joinSquadByCode,
  getSquadDetails,
  updateSquadMission,
  uploadSquadFloorplan,
  deleteSquadFloorplan,
  createSquadPlanItem,
  toggleSquadPlanItem,
  deleteSquadPlanItem,
  getSquadMessages,
  sendSquadMessage,
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

// Public Dossier & Network Routes
router.get("/investigators", authenticateToken, getInvestigators);
router.get("/users/by-username/:username", authenticateToken, getPublicProfile);
router.get("/users/:userId/followers", authenticateToken, getUserFollowers);
router.get("/users/:userId/following", authenticateToken, getUserFollowing);
router.post("/users/:userId/follow", authenticateToken, toggleFollow);

// Direct Communications Routes
router.get("/conversations", authenticateToken, getConversations);
router.get("/messages/:userId", authenticateToken, getDirectMessages);
router.post("/messages", authenticateToken, sendDirectMessage);
router.put("/messages/:userId/read", authenticateToken, markMessagesAsRead);

// Notifications & Alert Routes
router.get("/notifications", authenticateToken, getNotifications);
router.put("/notifications/read", authenticateToken, markNotificationsAsRead);

router.post("/squads", authenticateToken, createSquad);
router.get("/squads/my", authenticateToken, getMySquads);
router.post("/squads/join", authenticateToken, joinSquadByCode);
router.get("/squads/:squadId", authenticateToken, getSquadDetails);
router.put("/squads/:squadId", authenticateToken, updateSquadMission);

// Floorplans
router.post("/squads/:squadId/floorplans", authenticateToken, uploadMedia, uploadSquadFloorplan);
router.delete("/squads/:squadId/floorplans/:floorplanId", authenticateToken, deleteSquadFloorplan);

// Tactical Plan Items
router.post("/squads/:squadId/plans", authenticateToken, createSquadPlanItem);
router.put("/squads/:squadId/plans/:itemId/toggle", authenticateToken, toggleSquadPlanItem);
router.delete("/squads/:squadId/plans/:itemId", authenticateToken, deleteSquadPlanItem);

// Group Comms
router.get("/squads/:squadId/messages", authenticateToken, getSquadMessages);
router.post("/squads/:squadId/messages", authenticateToken, sendSquadMessage);

export default router;
