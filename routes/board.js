import express from "express";
import { prisma } from "../lib/prisma.js";
import { getUserIdFromBearerHeader } from "../lib/auth.js";

const router = express.Router();

// ================== GET ALL BOARDS FOR USER ==================
router.get("/user/:id", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const boards = await prisma.board.findMany({
      where: { ownerId: userId }
    });

    res.json(boards);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch boards" });
  }
});


// ================== CREATE BOARD ==================
router.post("/", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { title, description } = req.body;

    if (!title) return res.status(400).json({ error: "Title is required" });

    const newBoard = await prisma.board.create({
      data: {
        title,
        description: description || null,
        ownerId: userId
      }
    });

    res.json(newBoard);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create board" });
  }
});



// ================== GET BOARD ==================
router.get("/:id", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const boardId = parseInt(req.params.id);

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        lists: { include: { cards: true } }
      }
    });

    if (!board) return res.status(404).json({ error: "Board not found" });

    // تأكد إن المستخدم هو المالك
    if (board.ownerId !== userId) return res.status(403).json({ error: "Forbidden" });

    res.json(board);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch board" });
  }
});

// ================== UPDATE BOARD ==================
router.put("/:id", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const boardId = parseInt(req.params.id);
    const { title, description } = req.body;

    // تحقق إن المستخدم هو المالك
    const board = await prisma.board.findUnique({ where: { id: boardId } });
    if (!board) return res.status(404).json({ error: "Board not found" });
    if (board.ownerId !== userId) return res.status(403).json({ error: "Forbidden" });

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

// ================== CREATE LIST ==================
router.post("/lists", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { boardId, title } = req.body;

    // optional: تحقق من وجود الـ Board
    if (boardId) {
      const board = await prisma.board.findUnique({ where: { id: boardId } });
      if (!board) return res.status(400).json({ error: "Board not found" });
      if (board.ownerId !== userId) return res.status(403).json({ error: "Forbidden" });
    }

    const newList = await prisma.cardList.create({
      data: { title, boardId: boardId || null, ownerId: userId }
    });

    res.json(newList);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add list" });
  }
});

// ================== DELETE LIST ==================
router.delete("/lists/:id", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const listId = parseInt(req.params.id);
    const list = await prisma.cardList.findUnique({ where: { id: listId } });
    if (!list) return res.status(404).json({ error: "List not found" });
    if (list.ownerId !== userId) return res.status(403).json({ error: "Forbidden" });

    await prisma.cardList.delete({ where: { id: listId } });
    res.json({ message: "Deleted list" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete list" });
  }
});

// ================== CREATE CARD ==================
router.post("/cards", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { listId, title, content } = req.body;

    const list = await prisma.cardList.findUnique({ where: { id: listId } });
    if (!list) return res.status(404).json({ error: "List not found" });
    if (list.ownerId !== userId) return res.status(403).json({ error: "Forbidden" });

    const card = await prisma.card.create({
      data: { listId, title, content, ownerId: userId }
    });

    res.json(card);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add card" });
  }
});

// ================== UPDATE CARD ==================
router.put("/cards/:id", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const cardId = parseInt(req.params.id);
    const { title, content } = req.body;

    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: "Card not found" });
    if (card.ownerId !== userId) return res.status(403).json({ error: "Forbidden" });

    const updated = await prisma.card.update({
      where: { id: cardId },
      data: { title, content }
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update card" });
  }
});

// ================== DELETE CARD ==================
router.delete("/cards/:id", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const cardId = parseInt(req.params.id);
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: "Card not found" });
    if (card.ownerId !== userId) return res.status(403).json({ error: "Forbidden" });

    await prisma.card.delete({ where: { id: cardId } });
    res.json({ message: "Deleted card" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete card" });
  }
});

export default router;
