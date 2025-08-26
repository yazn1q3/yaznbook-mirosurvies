// auth.js
// بسيطة جدًا: بتجيب userId من هيدر Authorization
export function getUserIdFromBearerHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  // هنا اعتبرنا token هو userId مباشرة
  return Number(token);
}
