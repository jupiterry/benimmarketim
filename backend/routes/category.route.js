import express from "express";
import { getCategories } from "../controllers/category.controller.js";

const router = express.Router();

// Public route - kategorileri productCount ile getir
router.get("/", getCategories);

export default router;

