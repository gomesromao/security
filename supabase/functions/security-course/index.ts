/* ======================================================================
   security-course

   The only door to public.security_course_progress. The table has RLS on
   and no policy grants a write to anyone, so every insert and update has
   to come through here, on the service role.

   Called server to server by coconut-security.vercel.app. It is not a
   public endpoint: there is no CORS header on purpose, and every request
   has to carry the shared secret. A browser can never reach it.

   Two actions:
     lookup   { email }                   is this a Coconut Hub account?
     progress { email, step, completed }   remember where they are

   Reaching the end sends one email to the team, once per person, ever.
   ====================================================================== */

const SECRET = Deno.env.get("COURSE_API_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const TEAM = ["daniel@coconutva.com", "jeem@coconutva.com", "hr@coconutva.com"];

/* Who hears about a completion. The list is here in the code, not in the
   environment, because it is a decision and not a setting. COURSE_NOTIFY_TO
   exists so a test run can be pointed at one inbox instead of at all three,
   and it should be unset the rest of the time. */
const OVERRIDE = (Deno.env.get("COURSE_NOTIFY_TO") ?? "")
  .split(",")
  .map(function (part) { return part.trim(); })
  .filter(Boolean);
const NOTIFY = OVERRIDE.length ? OVERRIDE : TEAM;

/* The three people who receive the completion email can open the course
   themselves, whether or not they hold a Coconut Hub account. Without this,
   the owners of the material are the one group locked out of it. */
const ALWAYS_ALLOWED = TEAM;
const FROM = "Coconut Security <hr@coconutva.com>";
const COURSE_URL = "https://coconut-security.vercel.app/course/";
const TOTAL_STEPS = 9;

const SANS = "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/* Same cost whether the first character is wrong or the last one is. */
function secretOk(given: string | null): boolean {
  if (!SECRET || !given || given.length !== SECRET.length) return false;
  let diff = 0;
  for (let i = 0; i < SECRET.length; i++) diff |= SECRET.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

async function rest(path: string, init: RequestInit = {}) {
  return await fetch(SUPABASE_URL + path, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function rpc(name: string, args: Record<string, unknown>) {
  const resp = await rest("/rest/v1/rpc/" + name, {
    method: "POST",
    body: JSON.stringify(args),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok) {
    console.error("security-course: rpc " + name + " failed", resp.status, body);
    throw new Error("rpc " + name + " failed");
  }
  return body;
}

/* The Hub account behind an address, or null. Matched case insensitively,
   because people type their own address however they like. */
async function findHubUser(email: string) {
  const resp = await rest(
    "/rest/v1/users?select=id,name,email&limit=1&email=ilike." + encodeURIComponent(email),
  );
  if (!resp.ok) {
    console.error("security-course: user lookup failed", resp.status, await resp.text());
    throw new Error("user lookup failed");
  }
  const rows = await resp.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const manilaStamp = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(iso)) + " (Manila)";

async function sendCompletionEmail(row: {
  name: string | null;
  email: string;
  completed_at: string;
}) {
  if (!RESEND_KEY) {
    console.error("security-course: RESEND_API_KEY is not set, no email sent");
    return false;
  }

  const who = (row.name && row.name.trim()) || row.email;
  const finished = manilaStamp(row.completed_at);

  const text = [
    who + " has completed Coconut Security Essentials.",
    "Name: " + who,
    "Email: " + row.email,
    "Finished: " + finished,
    "Progress: " + TOTAL_STEPS + " of " + TOTAL_STEPS + " steps",
    "Course: " + COURSE_URL,
    "This note is automatic. It goes out once per person, the first time they reach the end of the course.",
  ].join("\n\n");

  const cell = 'style="padding: 3px 16px 3px 0; color: #6b7280;"';
  const val = 'style="padding: 3px 0;"';

  const html =
    '<div style="font-family: ' + SANS + '; font-size: 15px; line-height: 1.6; color: #1f2937;">' +
    '<p style="margin: 0 0 16px;"><strong>' + escapeHtml(who) +
    "</strong> has completed Coconut Security Essentials.</p>" +
    '<table style="border-collapse: collapse; margin: 0 0 16px;">' +
    "<tr><td " + cell + ">Name</td><td " + val + ">" + escapeHtml(who) + "</td></tr>" +
    "<tr><td " + cell + ">Email</td><td " + val + ">" + escapeHtml(row.email) + "</td></tr>" +
    "<tr><td " + cell + ">Finished</td><td " + val + ">" + escapeHtml(finished) + "</td></tr>" +
    "<tr><td " + cell + ">Progress</td><td " + val + ">" + TOTAL_STEPS + " of " + TOTAL_STEPS +
    " steps</td></tr>" +
    "</table>" +
    '<p style="margin: 0 0 16px;"><a href="' + COURSE_URL + '">' + COURSE_URL + "</a></p>" +
    '<p style="margin: 0; font-size: 13px; color: #6b7280;">This note is automatic. It goes out once ' +
    "per person, the first time they reach the end of the course.</p>" +
    "</div>";

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + RESEND_KEY,
    },
    body: JSON.stringify({
      from: FROM,
      to: NOTIFY,
      subject: "Security Essentials completed: " + who,
      html,
      text,
    }),
  });

  if (!resp.ok) {
    console.error(
      "security-course: Resend rejected the completion email",
      resp.status,
      await resp.text(),
    );
    return false;
  }
  console.log("security-course: completion email sent for", row.email);
  return true;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  if (!SECRET || !SUPABASE_URL || !SERVICE_KEY) {
    console.error(
      "security-course: missing COURSE_API_SECRET, SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
    return json({ error: "Not configured." }, 500);
  }
  if (!secretOk(req.headers.get("x-course-secret"))) {
    return json({ error: "Not allowed." }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_e) {
    return json({ error: "Bad request." }, 400);
  }

  const action = typeof body.action === "string" ? body.action : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return json({ error: "email is required." }, 400);

  try {
    if (action === "lookup") {
      const user = await findHubUser(email);
      if (!user) {
        if (!ALWAYS_ALLOWED.includes(email)) return json({ found: false });

        await rpc("security_course_record", {
          p_email: email,
          p_name: null,
          p_user_id: null,
          p_step: 0,
          p_completed: false,
        });
        return json({ found: true, email, name: "" });
      }

      // Store the address exactly as the Hub holds it, so one person is one
      // row no matter which casing they typed.
      const canonical = String(user.email || email).trim().toLowerCase();
      await rpc("security_course_record", {
        p_email: canonical,
        p_name: user.name ?? null,
        p_user_id: user.id ?? null,
        p_step: 0,
        p_completed: false,
      });

      return json({ found: true, email: canonical, name: user.name ?? "" });
    }

    if (action === "progress") {
      const step = Number(body.step);
      const completed = body.completed === true;

      const row = await rpc("security_course_record", {
        p_email: email,
        p_name: typeof body.name === "string" ? body.name : null,
        p_user_id: null,
        p_step: Number.isFinite(step) ? Math.trunc(step) : 0,
        p_completed: completed,
      });

      let notified = false;
      if (completed) {
        // Whoever wins this update owns the email. Everyone else gets null
        // back and sends nothing.
        const claim = await rpc("security_course_claim_notification", { p_email: email });
        if (claim && claim.completed_at) {
          notified = await sendCompletionEmail(claim);
          if (!notified) {
            // Hand the claim back, so a later request can try again rather
            // than leaving the team with no email at all.
            try {
              await rest(
                "/rest/v1/security_course_progress?email=eq." + encodeURIComponent(email),
                { method: "PATCH", body: JSON.stringify({ completion_notified_at: null }) },
              );
            } catch (_e) {
              console.error("security-course: could not release the notification claim", email);
            }
          }
        }
      }

      return json({
        ok: true,
        last_step: row?.last_step ?? null,
        completed: Boolean(row?.completed_at),
        notified,
      });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error("security-course: unexpected error", e);
    return json({ error: "Server error." }, 500);
  }
});
