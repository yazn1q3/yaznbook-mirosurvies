// routes/lists.js
import express from "express";
import { prisma } from "../lib/prisma.js";
import { getUserIdFromBearerHeader } from "../lib/auth.js";

const router = express.Router();

// GET كل القوائم
router.get("/", async (req, res) => {
  const lists = await prisma.list.findMany({
    include: { products: true },
  });
  res.json(lists);
});

// GET قائمة بالـ id
router.get("/:id", async (req, res) => {
  const list = await prisma.list.findUnique({
    where: { id: Number(req.params.id) },
    include: { products: true },
  });
  if (!list) return res.status(404).json({ error: "List not found" });
  res.json(list);
});

// POST إنشاء قائمة
router.post("/", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { name, productIds } = req.body;
    const newList = await prisma.list.create({
      data: {
        name,
        userId,
        products: {
          connect: productIds.map((id) => ({ id })),
        },
      },
      include: { products: true },
    });
    res.json(newList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
