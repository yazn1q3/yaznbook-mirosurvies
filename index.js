import express from "express";
import { Parser as MathParser } from "expr-eval";
import Decimal from "decimal.js";
import Fraction from "fraction.js";
import Parser from "rss-parser";
import cors from "cors";  // <--- ده المطلوب
import { hash } from "bcryptjs";
import boardRoutes from "./routes/board.js";
import { PrismaClient } from "@prisma/client";
import productRouter from "./routes/product.js"; // تأكد المسار صح
import cartRoutes from "./routes/cart.js";
import NodeCache from "node-cache";
import { createClient } from 'redis'; // استيراد createClient من redis

const cache = new NodeCache({ stdTTL: 30, checkperiod: 60 }); // cache 30s
const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use(cors({
  origin: "*", 
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
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

// تأكد من أن العميل يتم إنشاؤه قبل الاستخدام
const redis = createClient({
  username: 'default',
  password: 'iYHomheaoenuU82qRwFKpt9LKxmrAogS',
  socket: {
    host: 'redis-14106.c321.us-east-1-2.ec2.redns.redis-cloud.com',
    port: 14106,
  },
});

// تأكد من الاتصال بـ Redis بعد إنشائه
redis.connect().catch(console.error);

// تأكد من إدارة الاتصال بشكل صحيح
redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

const calc = new SimpleMath();

const wordList = [
  "قلم","كتاب","شمس","قمر","بحر","ريح","نار","ورد","نجم","شجرة",
  "سماء","ماء","صخر","حصان","جبل","طيور","مطر","ثلج"
];

function generateRecoveryPhrase(numWords = 6) {
  let phrase = [];
  for (let i = 0; i < numWords; i++) {
    const index = Math.floor(Math.random() * wordList.length);
    phrase.push(wordList[index]);
  }
  return phrase.join(" ");
}

app.get("/users/:id/notifications", authMiddleware, async (req, res) => {
  const { id } = req.params;

  // تأكد إن الـ token يطابق الـ param
  if (Number(req.userId) !== Number(id)) 
    return res.status(403).json({ message: "Forbidden" });

  const cacheKey = `user:${id}:notifications`;  // Create a unique key for the cache

  // Try fetching the data from Redis cache
  const cachedNotifications = await redis.get(cacheKey);
  
  if (cachedNotifications) {
    // If notifications are found in cache, return them directly
    return res.json(JSON.parse(cachedNotifications));
  }

  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: Number(id) },
      orderBy: { createdAt: "desc" },
      include: {
        product: true,
        comment: true,
      },
    });

    // Cache the notifications for 60 seconds
// Cache the notifications for 60 seconds
await redis.set(cacheKey, JSON.stringify(notifications), { EX: 60 });

    // Return the fetched notifications
    res.json(notifications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

app.use("/cart", cartRoutes);

app.use("/products", productRouter); // أي طلب يبدأ بـ /products هيبقى تحت productRouter

app.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ message: "كل الحقول مطلوبة" });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: "البريد الإلكتروني مستخدم مسبقًا" });
    }

    const hashedPassword = await hash(password, 10);
    const recoveryPhrase = generateRecoveryPhrase(6);

    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        recoveryPhrase,
        mfsVerified: false,
      },
    });

    return res.status(201).json({
      message: "تم إنشاء الحساب",
      recoveryPhrase,
    });

  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ message: "حدث خطأ داخلي في الخادم" });
  }
});

app.use("/boards", boardRoutes);


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
  const limit = parseInt(typeof req.query.limit === 'string' ? req.query.limit : '10', 10) || 10;
  const cursor = req.query.cursor ? { id: parseInt(req.query.cursor, 10) } : undefined;

  const cacheKey = `products_cursor${req.query.cursor || 'start'}_limit${limit}`; // Create a unique cache key for the request

  // Try fetching the cached data from Redis
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    // If data is found in Redis, return it as the response
    return res.json(JSON.parse(cached));
  }

  try {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      cursor,
      skip: cursor ? 1 : 0, // Skip the cursor itself
      take: limit,
      select: {
        id: true,
        title: true,
        price: true,
        description: true,
        image: true,
        seller: { select: { id: true, name: true } },
        comments: { select: { id: true, content: true, createdAt: true } },
      },
    });

    const lastProductId = products.length ? products[products.length - 1].id : null;

    const response = {
      products,
      nextCursor: lastProductId, // Cursor for next page
      limit,
      hasMore: products.length === limit,
    };

    // Cache the response in Redis for 60 seconds (TTL)
await redis.set(cacheKey, JSON.stringify(response), { EX: 60 });

    // Return the fetched products as the response
    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch products", details: String(err) });
  }
});


app.get("/posts/:id", async (req, res) => {
  try {
    const postId = parseInt(req.params.id, 10);

    if (isNaN(postId)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        likes: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const response = {
      ...post,
      likesCount: post.likes.length,
    };

    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch post" });
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
        tabadls: true,
        name: true,
        email: true,
        description: true,
        profileImageUrl: true,
        coverImageUrl: true,
        pagesOwned: true,
        products: true,
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

// Middleware للتحقق من Bearer Token (هنا مجرد userId)
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const userId = Number(auth.split(" ")[1]); // حوّلها لرقم
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  req.userId = userId;
  next();
}


// Get profile by user ID
app.get("/user/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(id) },
      include: {
        products: true,
        productLists: { include: { products: true } },
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    const store = await prisma.store.findMany({
      where: { userId: Number(id) },
    });

    const boards = await prisma.board.findMany({
      where: { userId: Number(id) },
      include: { lists: true },
    });

    res.json({ ...user, store, boards });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Update profile images
app.put("/users/:id/updateImage", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { profileImageUrl, coverImageUrl } = req.body;

if (Number(req.userId) !== Number(id)) 
  return res.status(403).json({ error: "Forbidden" });

  try {
    const updatedUser = await prisma.user.update({
      where: { id: Number(id) },
      data: { profileImageUrl, coverImageUrl },
    });
    res.json(updatedUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update images" });
  }
});

// Add product to list
app.post("/lists/:id/addProduct", async (req, res) => {
  const { id } = req.params;
  const { productId } = req.body;

  try {
    const list = await prisma.productList.update({
      where: { id: Number(id) },
      data: { products: { connect: { id: Number(productId) } } },
      include: { products: true },
    });
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add product" });
  }
});

app.post("/lists", authMiddleware, async (req, res) => {
  const { title } = req.body;
  const userId = Number(req.userId);

  if (!title || !title.trim()) {
    return res.status(400).json({ error: "Title is required" });
  }

  try {
    // تحقق إن الـ user موجود
    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) return res.status(404).json({ error: "User not found" });

 const newList = await prisma.productList.create({
  data: {
    title,
    owner: { connect: { id: Number(req.userId) } }, // بدل user
  },
});


    res.json(newList);
  } catch (err) {
    console.error("Failed to create list:", err);
    res.status(500).json({ error: "Failed to create list" });
  }
});


// Delete list
app.delete("/lists/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.productList.delete({ where: { id: Number(id) } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete list" });
  }
});

app.get("/me/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    // جلب بيانات المستخدم مع جميع العلاقات المرتبطة به
const user = await prisma.user.findUnique({
  where: { id: Number(id) },
  include: {
    products: true,
    productLists: true,
    postcomments: true,
    likedPosts: true,
    pagesOwned: true,
    pagesFollowed: true,
    playlists: true,
    songs: true,
    wantInReturnComments: true,
    tabadls: true,
    cardLists: true,
    cards: true,
    notifications: true,
    orders: true,
    searchHistory: true,
    productViews: true,
    messagesSent: true,
    messagesReceived: true,
    store: true,
    profiles: true,
    boards: true,
    reviews: true,
    cart: true,
    mfsVerified: true,
    recoveryPhrase: true,
    comments: true,
    posts: true,
    applications: true,
    reports: true,
  },
});


    if (!user) return res.status(404).json({ message: "User not found" });

    // إرسال البيانات المطلوبة للمستخدم
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/boards/user/:id", async (req, res) => {
  const { id } = req.params;
  const cacheKey = `user:${id}:boards`; // المفتاح الفريد لتخزين اللوحات

  try {
    // محاولة الحصول على البيانات من Redis
    const cachedBoards = await redis.get(cacheKey);
    
    if (cachedBoards) {
      // إذا كانت البيانات موجودة في Redis، إرجاعها مباشرة
      console.log('Returning boards from cache');
      return res.json(JSON.parse(cachedBoards));
    }

    // إذا لم تكن البيانات في Redis، نقوم بجلبها من قاعدة البيانات
    const boards = await prisma.board.findMany({
      where: { userId: Number(id) },
      include: { lists: true },
    });

    // تخزين اللوحات في Redis لمدة 60 ثانية
    redis.setex(cacheKey, 60, JSON.stringify(boards));

    // إرجاع اللوحات التي تم جلبها من قاعدة البيانات
    res.json(boards);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch boards" });
  }
});


// === Start server with Render PORT ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
