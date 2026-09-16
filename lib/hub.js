/* ======================================================================
   The one line this site has into Coconut Hub.

   It does not hold a Hub key of any kind. It calls a single Hub edge
   function, security-course, which owns the only table this project added
   over there and does the writing itself on the Hub side.

   So the worst a leak of this site's environment can do is let somebody
   record course progress. It cannot read the Hub, cannot write anything
   else, and cannot sign in as anyone.
   ====================================================================== */

const PATH = "/functions/v1/security-course";

export function hubConfigured() {
  return Boolean(process.env.HUB_URL && process.env.COURSE_API_SECRET);
}

/* Returns the parsed body on success, or throws. Callers decide whether a
   failure is worth telling the reader about: enrolment is, progress is not. */
export async function courseCall(action, payload) {
  const base = (process.env.HUB_URL || "").replace(/\/+$/, "");
  const secret = process.env.COURSE_API_SECRET;

  if (!base || !secret) {
    throw new Error("HUB_URL or COURSE_API_SECRET is not set");
  }

  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 8000);

  try {
    const response = await fetch(base + PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-course-secret": secret
      },
      body: JSON.stringify({ action: action, ...payload }),
      signal: controller.signal
    });

    const body = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error("security-course returned " + response.status);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}
