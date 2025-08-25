import express from "express";
import { Parser as MathParser } from "expr-eval";
import Decimal from "decimal.js";
import Fraction from "fraction.js";
import Parser from "rss-parser";
import cors from "cors";  // <--- ده المطلوب
import { PrismaClient } from "@prisma/client";
import NodeCache from "node-cache";
const cache = new NodeCache({ stdTTL: 30, checkperiod: 60 }); // cache 30s
const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use(cors());
// === SimpleMath ===
class SimpleMath {
  constructor() {
    this.parser = new MathParser();
    this.functions = {
      sqrt: (x) => {
        if (x < 0) throw new Error("Square root of negative number");
        return Math.sqrt(x);
      },
      pow: Math.pow,
      abs: Math.abs,
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      log: (x, base) => (base ? Math.log(x) / Math.log(base) : Math.log(x)),
      round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
      add: (a, b) => new Decimal(a).plus(b).toNumber(),
      sub: (a, b) => new Decimal(a).minus(b).toNumber(),
      mul: (a, b) => new Decimal(a).times(b).toNumber(),
      div: (a, b) => {
        if (b === 0) throw new Error("Division by zero");
        return new Decimal(a).div(b).toNumber();
      },
      fracAdd: (a, b) => new Fraction(a).add(new Fraction(b)).valueOf(),
      fracSub: (a, b) => new Fraction(a).sub(new Fraction(b)).valueOf(),
      fracMul: (a, b) => new Fraction(a).mul(new Fraction(b)).valueOf(),
      fracDiv: (a, b) => new Fraction(a).div(new Fraction(b)).valueOf(),
    };
    this.parser.functions = { ...this.functions };
    this.constants = { PI: Math.PI, E: Math.E };
  }

  evaluate(expression) {
    const context = { ...this.functions, ...this.constants };
    const ast = this.parser.parse(expression);
    return ast.evaluate(context);
  }
}

const calc = new SimpleMath();


// === POST /store ===
// إنشاء متجر جديد
app.post("/store", async (req, res) => {
  try {
    let { userId, title, description, links } = req.body;
    const userIdInt = Number(userId);

    if (!userId || isNaN(userIdInt)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    // حماية من spam أو بيانات كبيرة
    title = String(title).slice(0, 100);
    description = String(description).slice(0, 500);
    links = Array.isArray(links) ? links.slice(0, 10) : [];

    const existing = await prisma.store.findUnique({
      where: { ownerId: userIdInt },
      select: { id: true },
    });

    if (existing) {
      return res.status(400).json({ error: "User already has a store" });
    }

    const store = await prisma.store.create({
      data: {
        title,
        description,
        links,
        owner: { connect: { id: userIdInt } },
      },
      select: { id: true, title: true, description: true }, // أسرع من جلب كل الحقول
    });

    res.status(201).json(store);
} catch (error) {
  console.error("Store creation error:", error);
  if (error.code === "P2002") { // Prisma unique constraint
    return res.status(400).json({ error: "Store already exists" });
  }
  res.status(500).json({ error: "Failed to create store" });
}
});


app.get("/api/products", async (req, res) => {
  const page = parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10) || 1;
  const limit = parseInt(typeof req.query.limit === 'string' ? req.query.limit : '10', 10) || 10;
  const skip = (page - 1) * limit;

  const cacheKey = `products_page${page}_limit${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          price: true,
          image: true,
          seller: { select: { id: true, name: true } },
          comments: { select: { id: true, content: true, createdAt: true } },
        },
      }),
      prisma.product.count(),
    ]);

    const response = {
      products,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
    };

    cache.set(cacheKey, response);
    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch products", details: String(err) });
  }
});

app.put("/boards/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;

    const board = await prisma.board.update({
      where: { id: parseInt(id) },
      data: { title, description },
    });

    res.json(board);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/profile/:id", async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        description: true,
        profileImageUrl: true,
        coverImageUrl: true,
        playlists: { select: { id: true, title: true } },
        pagesOwned: { select: { id: true, title: true } },
        products: { select: { id: true, name: true, price: true } },
        posts: { select: { id: true, title: true, content: true } },
        createdAt: true,
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// === GET /store ===
// جلب متجر + منتجاته
app.get("/store", async (req, res) => {
  try {
    const userId = Number(req.query.userId);

    if (isNaN(userId)) return res.status(400).json({ error: "Invalid user id" });

    const store = await prisma.store.findUnique({
      where: { ownerId: userId },
      include: { products: true },
    });

    if (!store) return res.status(404).json({ error: "Store not found" });

    res.json(store);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch store" });
  }
});


// === Route: /api/calc ===
app.post("/api/calc", (req, res) => {
  try {
    const { expression } = req.body;
    if (!expression) return res.status(400).json({ error: "No expression provided" });
    if (!/^[0-9+\-*/^().,\s\w]+$/.test(expression))
      return res.status(400).json({ error: "Invalid characters in expression" });

    const result = calc.evaluate(expression);
    res.json({ result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// === Route: /api/news ===
app.get("/api/news", async (req, res) => {
  try {
    const parser = new Parser({
      customFields: { item: ["media:content"] },
    });

    const feed = await parser.parseURL("http://feeds.bbci.co.uk/news/world/rss.xml");

    const news = feed.items.slice(0, 5).map((item) => {
      let image;
      if (item["media:content"]?.["$"]?.url) {
        image = item["media:content"]["$"].url;
      }
      return {
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        image,
      };
    });

    res.json(news);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch RSS" });
  }
});

// === Start server with Render PORT ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
