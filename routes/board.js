// routes/board.js
import express from "express";
import { prisma } from "../lib/prisma.js"; // لو عندك prisma.ts

const router = express.Router();

// GET /board/:id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const board = await prisma.board.findUnique({
      where: { id: parseInt(id) },
      include: { lists: { include: { cards: true } } },
    });
    if (!board) return res.status(404).json({ error: "Board not found" });
    res.json(board);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get board" });
  }
});

// DELETE /board/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.board.delete({ where: { id: parseInt(id) } });
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete board" });
  }
});

export default router;
