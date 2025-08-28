// src/routes/users.js
import express from "express";
import { prisma } from "../lib/prisma.js";
import { getUserIdFromBearerHeader } from "../lib/auth.js";

const router = express.Router();

router.put("/:id/updateImage", async (req, res) => {
  const userId = getUserIdFromBearerHeader(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { profileImageUrl, coverImageUrl } = req.body;
  const updated = await prisma.user.update({
    where: { id: Number(req.params.id) },
    data: { profileImageUrl, coverImageUrl },
  });

  res.json(updated);
});

export default router;
