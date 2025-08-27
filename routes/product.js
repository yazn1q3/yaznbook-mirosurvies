import express from "express";
import { prisma } from "../lib/prisma.js";
import { getUserIdFromBearerHeader } from "../lib/auth.js";

const router = express.Router();

const validCaptchas = {
  1: "Knjovme",
  2: "Themarket",
  3: "waittocreate",
};

const bannedWords = [
  "هههه","كيس","مزحة","apple","samsung","nike","شركة","مزيف","غبي","استهبال",
  "تجربة","fake","سحرية","ببلاش","خرافي","مخدرات","سلاح","جنسي","بوس","زق",
  "حرام","لعنة","fuck","sex","adult","سلف","تبرع","غش","طيز","قحبة","بزاز",
  "الاردن","الإردن","الأردن","جوالي","افا","كس","قضيب","عضو","مؤخرة","مؤخرتك","مؤخرتي"
];

// ================== CREATE PRODUCT ==================
router.post("/", async (req, res) => {
  try {
    const userId = getUserIdFromBearerHeader(req);
    if (!userId) return res.status(401).json({ error: "غير مصرح" });

    const { title, description, price, image, paypalLink, captchaAnswer, captchaImageId } = req.body;

    // ✅ تحقق من CAPTCHA
    if (
      !captchaAnswer ||
      !captchaImageId ||
      !validCaptchas[captchaImageId] ||
      validCaptchas[captchaImageId].toUpperCase() !== captchaAnswer.toUpperCase()
    ) {
      return res.status(400).json({ error: "رمز التحقق غير صحيح." });
    }

    // ✅ تحقق من العنوان
    if (!title || title.trim().length < 3) {
      return res.status(400).json({ error: "عنوان المنتج مطلوب وطوله 3 أحرف على الأقل" });
    }

    // ✅ تحقق من السعر
    if (typeof price !== "number" || price < 0) {
      return res.status(400).json({ error: "السعر يجب أن يكون رقم موجب" });
    }

    // ✅ تحقق من رابط باي بال
    if (paypalLink && !paypalLink.startsWith("https://www.paypal.com/ncp/payment/") && paypalLink !== "") {
      return res.status(400).json({ error: "رابط باي بال غير صالح، يجب أن يبدأ بـ https://www.paypal.com/ncp/payment/" });
    }

    // ✅ تحقق من الكلمات الممنوعة
    const lowerTitle = title.toLowerCase();
    const lowerDescription = (description || "").toLowerCase();
    const containsBannedWord = bannedWords.some(word => lowerTitle.includes(word) || lowerDescription.includes(word));
    if (containsBannedWord) {
      return res.status(400).json({ error: "🚫 لا يمكن إنشاء هذا المنتج لأن العنوان أو الوصف يحتوي على كلمات غير مسموحة." });
    }

    // ✅ إنشاء المنتج
    const product = await prisma.product.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        price,
        image: image?.trim() || null,
        sellerId: Number(userId),
        paypalLink: paypalLink?.trim() || null,
      },
    });

    res.json({ message: "تم إنشاء المنتج", product });
  } catch (err) {
    console.error("خطأ:", err);
    res.status(500).json({ error: "حدث خطأ أثناء إنشاء المنتج" });
  }
});

export default router;
