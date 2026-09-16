/* ======================================================================
   Session token for Coconut Security Essentials.

   This is NOT a Coconut Hub token and it carries no password. The reader
   gives an email, the server checks it against Coconut Hub once, and what
   the browser gets back is this: a small HMAC-signed blob naming who is
   reading, useless against the hub or anything else.

   It lasts a month, because the course is taken in short sittings over
   several days and nobody should be stopped at the door twice.

   Web Crypto only, so the same file runs in the Node functions and in
   the edge middleware without a second implementation to keep in sync.
   ====================================================================== */

const enc = new TextEncoder();
const dec = new TextDecoder();

export const COOKIE = "cv_session";
export const TTL_SECONDS = 30 * 24 * 60 * 60;

function toBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signSession(payload, secret) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS };
  const data = toBase64Url(enc.encode(JSON.stringify(body)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(data));
  return data + "." + toBase64Url(new Uint8Array(sig));
}

/* Returns the payload, or null for anything that is not a live, intact
   token. Callers only ever need to check for null. */
export async function verifySession(token, secret) {
  if (typeof token !== "string" || !secret) return null;

  const dot = token.indexOf(".");
  if (dot < 1 || dot === token.length - 1) return null;

  const data = token.slice(0, dot);
  let signature;
  try {
    signature = fromBase64Url(token.slice(dot + 1));
  } catch (e) {
    return null;
  }

  // subtle.verify compares in constant time, so a wrong signature and a
  // near-miss cost the same.
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signature,
    enc.encode(data)
  );
  if (!ok) return null;

  let body;
  try {
    body = JSON.parse(dec.decode(fromBase64Url(data)));
  } catch (e) {
    return null;
  }

  if (typeof body.exp !== "number" || body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}

export function readCookie(header, name) {
  if (!header) return null;
  const parts = header.split(";");
  for (let i = 0; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq < 0) continue;
    if (parts[i].slice(0, eq).trim() === name) return parts[i].slice(eq + 1).trim();
  }
  return null;
}

export function cookieHeader(value, maxAge) {
  return [
    COOKIE + "=" + value,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=" + maxAge
  ].join("; ");
}
