// routes/store.js
import express from "express";
import { prisma } from "../lib/prisma.js";

const router = express.Router();

// GET كل المتاجر
router.get("/", async (req, res) => {
  const stores = await prisma.store.findMany({
    include: { products: true },
  });
  res.json(stores);
});

// GET متجر واحد
router.get("/:id", async (req, res) => {
  const store = await prisma.store.findUnique({
    where: { id: Number(req.params.id) },
    include: { products: true },
  });
  if (!store) return res.status(404).json({ error: "Store not found" });
  res.json(store);
});

// POST إنشاء متجر
router.post("/", async (req, res) => {
  try {
    const { name, description } = req.body;
    const store = await prisma.store.create({
      data: { name, description },
    });
    res.json(store);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
