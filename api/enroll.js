/* ======================================================================
   POST /api/enroll  { email }

   The door to the course. No password: the reader says who they are, the
   server checks that the address belongs to a Coconut Hub account, and on
   a match issues a session for THIS site only.

   This is identification, not authentication. It tells us who is taking
   the course and keeps the material off the open web. It is not a claim
   that the person at the keyboard owns the mailbox, and nothing behind
   this door is worth more than the one-pager that is already public.

   What it deliberately does not do:
     - it never touches a Hub password
     - it never holds a Hub key, service role or otherwise
     - it never writes anything to the Hub beyond one row in the course
       table, through the Hub's own edge function
   ====================================================================== */

import { signSession, cookieHeader, TTL_SECONDS } from "../lib/session.js";
import { courseCall, hubConfigured } from "../lib/hub.js";

const UNKNOWN =
  "We could not find that address in Coconut Hub. Use the same work email you use for the Hub, or ask HR to check it.";

// Deliberately loose. The real check is whether Coconut Hub knows the
// address, so this only has to catch typing that cannot be an email at all.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ----------------------------------------------------------- rate limit */
// An endpoint that answers "is this address a Coconut account" is an
// endpoint somebody can use to find out who works here, one guess at a
// time. Two cheap brakes, and neither is pretending to be a wall:
//
//   - the request has to come from this site, which stops a page somewhere
//     else quietly asking on a visitor's behalf
//   - a window in memory, which slows a single caller down
//
// The window lives in one warm instance, so a determined attacker spread
// across instances gets around it. Catching the lazy case is the point. If
// this ever matters more than that, it needs a shared store, not a bigger
// number here.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_IN_WINDOW = 20;
const attempts = new Map();

function tooMany(ip) {
  if (!ip) return false;

  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter(function (t) { return now - t < WINDOW_MS; });
  recent.push(now);
  attempts.set(ip, recent);

  // Keep the map from growing without bound in a long-lived instance.
  if (attempts.size > 500) {
    for (const [key, times] of attempts) {
      if (!times.length || now - times[times.length - 1] > WINDOW_MS) attempts.delete(key);
    }
  }

  return recent.length > MAX_IN_WINDOW;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;   // curl and old browsers send none; not a signal
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  try {
    return new URL(origin).host === host;
  } catch (e) {
    return false;
  }
}

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
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!sameOrigin(req)) {
    return res.status(403).json({ error: "Open the course from coconut-security.vercel.app." });
  }

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (tooMany(ip)) {
    return res.status(429).json({ error: "Too many attempts. Wait a few minutes, then try again." });
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret || !hubConfigured()) {
    console.error("enroll: missing SESSION_SECRET, HUB_URL or COURSE_API_SECRET");
    return res.status(500).json({ error: "The course is not configured. Contact the team." });
  }

  const body = await readBody(req);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || email.length > 254 || !LOOKS_LIKE_EMAIL.test(email)) {
    return res.status(400).json({ error: "Enter your work email address." });
  }

  let result;
  try {
    result = await courseCall("lookup", { email: email });
  } catch (e) {
    console.error("enroll: security-course call failed", e);
    return res.status(502).json({ error: "Could not reach the course service. Try again shortly." });
  }

  // The service decides who may enter, and it now lets everyone in: an address
  // the Hub does not hold still takes the course, it just does not earn a
  // certificate at the end and the team hears about it instead. This branch
  // stays for a service that fails to answer at all, not for a stranger.
  if (!result || !result.found) {
    return res.status(401).json({ error: UNKNOWN });
  }

  const name = typeof result.name === "string" ? result.name : "";
  const canonical = typeof result.email === "string" && result.email ? result.email : email;

  const session = await signSession({ email: canonical, name: name }, secret);

  res.setHeader("Set-Cookie", cookieHeader(session, TTL_SECONDS));
  return res.status(200).json({ ok: true, user: { name: name, email: canonical } });
}
