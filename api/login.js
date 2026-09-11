/* ======================================================================
   POST /api/login  { email, password }

   Checks the credentials against Coconut Hub and, if they are good,
   issues a session for THIS site only.

   What this deliberately does not do:
     - it never sends the hub's API key to the browser
     - it never sends the hub's access token to the browser
     - it never writes to the hub

   The hub session created by the password check is revoked on the way
   out, with scope=local, so the reader's real hub sessions elsewhere
   are left exactly as they were.
   ====================================================================== */

import { signSession, cookieHeader, TTL_SECONDS } from "../lib/session.js";

const GENERIC = "That email and password did not match. Try again.";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (e) { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const hubUrl = (process.env.HUB_URL || "").replace(/\/+$/, "");
  const anonKey = process.env.HUB_ANON_KEY;
  const secret = process.env.SESSION_SECRET;

  if (!hubUrl || !anonKey || !secret) {
    console.error("login: missing one of HUB_URL, HUB_ANON_KEY, SESSION_SECRET");
    return res.status(500).json({ error: "Sign-in is not configured. Contact the team." });
  }

  const body = await readBody(req);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return res.status(400).json({ error: "Enter your email and your password." });
  }

  let token;
  let user;
  try {
    const auth = await fetch(hubUrl + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (auth.status === 429) {
      return res.status(429).json({ error: "Too many attempts. Wait a minute, then try again." });
    }
    if (!auth.ok) {
      // Same message whether the address is unknown or the password is
      // wrong, so this page cannot be used to enumerate who works here.
      return res.status(401).json({ error: GENERIC });
    }

    const data = await auth.json();
    token = data.access_token;
    user = data.user;
    if (!token || !user || !user.id) {
      return res.status(401).json({ error: GENERIC });
    }
  } catch (e) {
    console.error("login: hub auth call failed", e);
    return res.status(502).json({ error: "Could not reach the sign-in service. Try again shortly." });
  }

  // Read the reader's own profile row, with the reader's own token. This
  // rides the hub policy that already lets a signed-in user select their
  // own row, so it needs nothing added on the hub side. Accounts with no
  // profile row still get in; they just do not get a display name.
  let name = "";
  let role = null;
  try {
    const profile = await fetch(
      hubUrl + "/rest/v1/users?select=name,role&id=eq." + encodeURIComponent(user.id),
      { headers: { apikey: anonKey, Authorization: "Bearer " + token } }
    );
    if (profile.ok) {
      const rows = await profile.json();
      if (Array.isArray(rows) && rows[0]) {
        name = typeof rows[0].name === "string" ? rows[0].name : "";
        role = typeof rows[0].role === "string" ? rows[0].role : null;
      }
    }
  } catch (e) {
    console.error("login: profile lookup failed, continuing without it", e);
  }

  // Hand the hub session back. Failure here is not the reader's problem,
  // so it is logged and swallowed.
  try {
    await fetch(hubUrl + "/auth/v1/logout?scope=local", {
      method: "POST",
      headers: { apikey: anonKey, Authorization: "Bearer " + token }
    });
  } catch (e) {
    console.error("login: could not revoke the temporary hub session", e);
  }
  token = null;

  const session = await signSession(
    { sub: user.id, email: user.email || email, name: name, role: role },
    secret
  );

  res.setHeader("Set-Cookie", cookieHeader(session, TTL_SECONDS));
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: true,
    user: { name: name, email: user.email || email, role: role }
  });
}
