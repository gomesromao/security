/* POST /api/logout: drops the cookie. Nothing to revoke upstream, since the
   hub session was already handed back at sign-in. */
import { cookieHeader } from "../lib/session.js";

export default async function handler(req, res) {
  res.setHeader("Set-Cookie", cookieHeader("", 0));
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ ok: true });
}
