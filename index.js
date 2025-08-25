import express from "express";
import { Parser as MathParser } from "expr-eval";
import Decimal from "decimal.js";
import Fraction from "fraction.js";
import Parser from "rss-parser";
import cors from "cors";  // <--- ده المطلوب
import { PrismaClient } from "@prisma/client";

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
    const { userId, title, description, links } = req.body;
    const userIdInt = Number(userId);

    if (isNaN(userIdInt)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const existing = await prisma.store.findUnique({
      where: { ownerId: userIdInt },
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
    });

    res.status(201).json(store);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create store" });
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
