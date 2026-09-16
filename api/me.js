/* GET /api/me: who the current cookie says this is, or 401. */
import { verifySession, readCookie, COOKIE } from "../lib/session.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.error("me: missing SESSION_SECRET");
    return res.status(500).json({ error: "Not configured." });
  }

  const session = await verifySession(readCookie(req.headers.cookie, COOKIE), secret);
  if (!session) return res.status(401).json({ error: "Not signed in." });

  return res.status(200).json({
    user: { name: session.name || "", email: session.email || "" }
  });
}
