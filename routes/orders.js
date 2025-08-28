// routes/orders.js
import express from "express";
import { prisma } from "../lib/prisma.js";
import { getUserIdFromBearerHeader } from "../lib/auth.js";

const router = express.Router();

// GET طلباتي
router.get("/", async (req, res) => {
  const userId = getUserIdFromBearerHeader(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const orders = await prisma.order.findMany({
    where: { userId },
    include: { products: true },
  });
  res.json(orders);
});

// POST إنشاء طلب
router.post("/", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { productIds } = req.body;
    const order = await prisma.order.create({
      data: {
        userId,
        products: {
          connect: productIds.map((id) => ({ id })),
        },
        status: "PENDING",
      },
      include: { products: true },
    });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
