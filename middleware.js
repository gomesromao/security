/* ======================================================================
   The gate.

   Only the course is behind it. The one-pager at / is open to anyone with
   the link, because it is the summary we want people to read and pass on.

   The protected list is matched in code rather than in a matcher regex,
   and it is one line long. The failure mode to worry about now is the
   opposite of before: a wrong pattern leaves the course open rather than
   locking the site, so keep this list explicit and boring.
   ====================================================================== */

import { next } from "@vercel/edge";
import { verifySession, readCookie, COOKIE } from "./lib/session.js";

const PROTECTED = [
  /^\/course(\/|$)/    // /course, /course/, /course/index.html
];

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!PROTECTED.some(function (re) { return re.test(path); })) return next();

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Fail closed. A missing secret must never mean an open course.
    console.error("middleware: SESSION_SECRET is not set, refusing to serve the course");
    return new Response("The course is not configured. Contact the team.", {
      status: 503,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" }
    });
  }

  const session = await verifySession(readCookie(request.headers.get("cookie"), COOKIE), secret);
  if (session) return next();

  const target = new URL("/start", url.origin);
  target.searchParams.set("next", path + url.search);

  return new Response(null, {
    status: 307,
    headers: { Location: target.toString(), "Cache-Control": "no-store" }
  });
}
