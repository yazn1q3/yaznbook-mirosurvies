import express from "express";
import { prisma } from "../lib/prisma.js";
import { getUserIdFromBearerHeader } from "../lib/auth.js";

const router = express.Router();

// GET /boards/:id
router.get("/:id", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const boardId = parseInt(req.params.id);
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        lists: {
          include: { cards: true }
        }
      }
    });

    if (!board) return res.status(404).json({ error: "Board not found" });
    res.json(board);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch board" });
  }
});

// PUT /boards/:id (update board title or description)
router.put("/:id", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const boardId = parseInt(req.params.id);
    const { title, description } = req.body;

    const updated = await prisma.board.update({
      where: { id: boardId },
      data: { title, description }
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update board" });
  }
});

// POST /boards/lists (add new list)
router.post("/lists", async (req, res) => {
  try {
    const { boardId, title } = req.body;
    const newList = await prisma.list.create({
      data: { boardId, title }
    });
    res.json(newList);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add list" });
  }
});

// DELETE /boards/lists/:id
router.delete("/lists/:id", async (req, res) => {
  try {
    const listId = parseInt(req.params.id);
    await prisma.list.delete({ where: { id: listId } });
    res.json({ message: "Deleted list" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete list" });
  }
});

// POST /boards/cards (add card)
router.post("/cards", async (req, res) => {
  try {
    const { listId, title, content } = req.body;
    const card = await prisma.card.create({
      data: { listId, title, content }
    });
    res.json(card);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add card" });
  }
});

// PUT /boards/cards/:id
router.put("/cards/:id", async (req, res) => {
  try {
    const cardId = parseInt(req.params.id);
    const { content } = req.body;
    const updated = await prisma.card.update({
      where: { id: cardId },
      data: { content }
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update card" });
  }
});

// DELETE /boards/cards/:id
router.delete("/cards/:id", async (req, res) => {
  try {
    const cardId = parseInt(req.params.id);
    await prisma.card.delete({ where: { id: cardId } });
    res.json({ message: "Deleted card" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete card" });
  }
});

export default router;
