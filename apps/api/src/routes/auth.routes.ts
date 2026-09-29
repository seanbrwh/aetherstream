import express from "express";
import { register, login, recover, reset } from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/recover", recover);
router.post("/reset", reset);

export default router;
