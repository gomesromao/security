/* ======================================================================
   POST /api/progress  { step, completed }

   Where this reader got to. Called by the course page every time someone
   moves forward, and once more when they reach the end.

   Two rules shape everything here:

     1. It is silent. Whatever happens, the reader sees nothing: no
        spinner, no error, no change in what the page does. A person taking
        a security course should not be interrupted by our bookkeeping.

     2. It never trusts the body for identity. Who this is comes from the
        signed cookie, so the step number is the only thing a browser can
        influence, and the worst it can claim is its own progress.
   ====================================================================== */

import { verifySession, readCookie, COOKIE } from "../lib/session.js";
import { courseCall, hubConfigured } from "../lib/hub.js";

const TOTAL_STEPS = 9;

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
    return res.status(405).end();
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret || !hubConfigured()) {
    console.error("progress: missing SESSION_SECRET, HUB_URL or COURSE_API_SECRET");
    return res.status(204).end();
  }

  const session = await verifySession(readCookie(req.headers.cookie, COOKIE), secret);
  if (!session || !session.email) return res.status(204).end();

  const body = await readBody(req);
  const raw = Number(body.step);
  const step = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 0), TOTAL_STEPS) : 0;
  const completed = body.completed === true;

  try {
    await courseCall("progress", {
      email: session.email,
      name: session.name || null,
      step: step,
      completed: completed
    });
  } catch (e) {
    // Logged and swallowed. Losing a step is a gap in a report; showing an
    // error would be a gap in someone's attention.
    console.error("progress: could not record step", step, "for", session.email, e);
  }

  return res.status(204).end();
}
