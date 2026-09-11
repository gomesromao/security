/* ======================================================================
   The gate.

   Runs in front of every request. Anything that is not on the short
   public list needs a valid session cookie, or it gets sent to the
   sign-in page with a note about where it was headed.

   The list is deliberately tiny and matched in code rather than in a
   matcher regex, because the failure mode of a wrong regex here is a
   site that quietly stops being gated at all.
   ====================================================================== */

import { next } from "@vercel/edge";
import { verifySession, readCookie, COOKIE } from "./lib/session.js";

const PUBLIC = [
  /^\/login\/?$/,          // the sign-in page
  /^\/login\.html$/,
  /^\/api\//,              // the functions authenticate themselves
  /^\/assets\//,           // css, js, logo: needed to render the sign-in page
  /^\/favicon/,
  /^\/robots\.txt$/,
  /^\/_vercel\//           // Vercel's own insights endpoints
];

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (PUBLIC.some(function (re) { return re.test(path); })) return next();

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Fail closed. A missing secret must never mean an open site.
    console.error("middleware: SESSION_SECRET is not set, refusing to serve");
    return new Response("Sign-in is not configured.", {
      status: 503,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" }
    });
  }

  const session = await verifySession(readCookie(request.headers.get("cookie"), COOKIE), secret);
  if (session) return next();

  const target = new URL("/login", url.origin);
  if (path !== "/") target.searchParams.set("next", path + url.search);

  return new Response(null, {
    status: 307,
    headers: { Location: target.toString(), "Cache-Control": "no-store" }
  });
}
