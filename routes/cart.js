import express from "express";
import { getCart, addToCart } from "../lib/cart.js";
import { getUserIdFromBearerHeader } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js"; // لو عندك prisma.ts

const router = express.Router();

// GET /cart
router.get("/", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const cart = await getCart(userId);
    res.json(cart);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get cart" });
  }
});

// POST /cart/add
router.post("/add", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: "ProductId required" });

    const result = await addToCart(userId, Number(productId));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add to cart" });
  }
});

// DELETE /cart/delete
router.delete("/delete", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { itemId } = req.body;
    if (!itemId) return res.status(400).json({ error: "itemId required" });

    const cart = await prisma.cart.findUnique({
      where: { userId },
      select: { id: true }
    });
    if (!cart) return res.status(404).json({ error: "Cart not found" });

    await prisma.cartItem.deleteMany({
      where: { id: itemId, cartId: cart.id },
    });

    const updatedCart = await getCart(userId);
    res.json(updatedCart);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete cart item" });
  }
});

export default router;
