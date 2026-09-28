import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import { createKnowledge, deleteKnowledge, getAiConfig, listKnowledge, seedKnowledge, toggleKnowledge, updateAiConfig, updateKnowledge } from "../controllers/aiKnowledge.controller.js";

const router = express.Router();
router.use(protectRoute, adminRoute);
router.get("/knowledge", listKnowledge);
router.post("/knowledge/seed", seedKnowledge);
router.post("/knowledge", createKnowledge);
router.put("/knowledge/:id", updateKnowledge);
router.patch("/knowledge/:id/status", toggleKnowledge);
router.delete("/knowledge/:id", deleteKnowledge);
router.get("/config", getAiConfig);
router.put("/config", updateAiConfig);
export default router;
