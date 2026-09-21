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

   Reaching the end sends one email to the team, once per person, ever, and
   then does one of two things exactly once more:

     the address is a Coconut Hub account  -> the certificate goes to them,
                                              carrying the name the Hub holds
     it is not                             -> no certificate, and the three
                                              addresses in TEAM are told why

   Neither outcome blocks the other. An address the Hub does not know still
   enrols, still records progress, still finishes, and still produces the team
   email. The only thing it does not produce is a certificate, because a
   certificate carrying a name nobody can vouch for is worth less than none.
   ====================================================================== */

import { buildCertificate } from "./certificate.ts";

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
/* The site moved to its own domain on 16 September and this constant did not
   follow, so the "Course:" link in every completion email since has pointed at
   a Vercel address that answers DEPLOYMENT_NOT_FOUND. Fixed here rather than
   left alone because the certificate now fetches from the same origin, and a
   wrong host would have meant no certificate at all rather than a dead link. */
const SITE_URL = "https://security-awareness.coconutva.com";
const COURSE_URL = SITE_URL + "/course/";
const TOTAL_STEPS = 9;

/* The certificate names every topic, and the topics are only ever written in
   one place: the course page itself.

   Read through /api/syllabus rather than by fetching /course/ directly. The
   course is behind the gate, so an unauthenticated fetch of it returns a 307
   to /start and would have parsed to nothing. That route reads the same HTML
   from disk and hands back the headings, which keeps one source of truth and
   still lets this function see it. Cached per warm instance. */
let syllabusCache: { n: number; title: string }[] | null = null;

async function loadSyllabus() {
  if (syllabusCache) return syllabusCache;
  const resp = await fetch(SITE_URL + "/api/syllabus");
  if (!resp.ok) throw new Error("syllabus " + resp.status);
  const body = await resp.json().catch(() => null);
  /* Shaped here rather than trusted. This crosses a network boundary, and a
     row missing a title would otherwise print as "undefined" on a document
     somebody keeps. */
  const steps: { n: number; title: string }[] = (Array.isArray(body?.steps) ? body.steps : [])
    .filter((s: unknown): s is { n: number; title: string } =>
      !!s && typeof (s as { title?: unknown }).title === "string" &&
      (s as { title: string }).title.trim().length > 0)
    .map((s: { n: number; title: string }) => ({ n: Number(s.n), title: s.title.trim() }));
  /* Refusing beats guessing. A certificate that quietly lists a stale or empty
     syllabus is the exact failure reading it from the course was meant to
     prevent, and the caller releases its claim so a later attempt can succeed. */
  if (!steps.length) throw new Error("syllabus came back empty");
  syllabusCache = steps;
  return syllabusCache;
}

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

async function resend(payload: Record<string, unknown>, what: string) {
  if (!RESEND_KEY) {
    console.error("security-course: RESEND_API_KEY is not set, no " + what + " sent");
    return false;
  }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + RESEND_KEY },
    body: JSON.stringify({ from: FROM, ...payload }),
  });
  if (!resp.ok) {
    console.error("security-course: Resend rejected the " + what, resp.status, await resp.text());
    return false;
  }
  return true;
}

/* The certificate itself, to the person who earned it. The name is the Hub's,
   not whatever was typed into the enrolment box, which is the whole reason a
   certificate is only issued when the Hub knows the address. */
async function sendCertificateEmail(row: {
  name: string | null;
  email: string;
  completed_at: string;
  certificate_id: string;
}) {
  const syllabus = await loadSyllabus();
  const who = (row.name && row.name.trim()) || row.email;
  const pdf = await buildCertificate({
    name: who,
    completedAt: row.completed_at,
    certificateId: row.certificate_id,
    syllabus,
    // No verification page exists yet. Printing an address that answers 404
    // invites exactly the doubt the line is meant to settle, so it stays off
    // until the route is real.
    verifyUrl: null,
    assetBase: SITE_URL,
  });

  let binary = "";
  for (const byte of pdf) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);

  const first = who.split(/\s+/)[0];
  const text = [
    "Hi " + first + ",",
    "You have completed Cyber Security Awareness Training. Your certificate is attached.",
    "It lists every topic you covered and carries the reference " + row.certificate_id + ".",
    "Thanks for taking the time to do it properly.",
    "Coconut Virtual Professionals",
  ].join("\n\n");

  const html =
    '<div style="font-family: ' + SANS + '; font-size: 15px; line-height: 1.6; color: #1f2937;">' +
    '<p style="margin: 0 0 16px;">Hi ' + escapeHtml(first) + ",</p>" +
    '<p style="margin: 0 0 16px;">You have completed <strong>Cyber Security Awareness Training</strong>. ' +
    "Your certificate is attached.</p>" +
    '<p style="margin: 0 0 16px;">It lists every topic you covered and carries the reference ' +
    "<strong>" + escapeHtml(row.certificate_id) + "</strong>.</p>" +
    '<p style="margin: 0 0 16px;">Thanks for taking the time to do it properly.</p>' +
    '<p style="margin: 0; color: #6b7280;">Coconut Virtual Professionals</p>' +
    "</div>";

  return await resend({
    to: [row.email],
    subject: "Your Cyber Security Awareness certificate",
    html,
    text,
    attachments: [{
      filename: "Coconut_Cyber_Security_Awareness_Certificate.pdf",
      content: base64,
    }],
  }, "certificate email");
}

/* Nobody is in trouble here, and the note says so. Somebody finished the
   course under an address the Hub does not hold, which is usually a personal
   email typed instead of a work one. The course counted; the certificate is
   waiting on someone matching the person to a Hub account. */
async function sendNoCertificateNotice(row: {
  name: string | null;
  email: string;
  completed_at: string;
}) {
  const who = (row.name && row.name.trim()) || row.email;
  const finished = manilaStamp(row.completed_at);

  const text = [
    who + " completed Cyber Security Awareness Training, but no certificate was sent.",
    "The address they used is not a Coconut Hub account, so there is no confirmed name to print on it.",
    "Email used: " + row.email,
    "Finished: " + finished,
    "Their progress is recorded either way, and they did not need to repeat anything.",
    "If this is someone we know, add or correct the address in Coconut Hub and tell them to open the course again with it. The certificate goes out on the next completion.",
  ].join("\n\n");

  const html =
    '<div style="font-family: ' + SANS + '; font-size: 15px; line-height: 1.6; color: #1f2937;">' +
    '<p style="margin: 0 0 16px;"><strong>' + escapeHtml(who) +
    "</strong> completed Cyber Security Awareness Training, but no certificate was sent.</p>" +
    '<p style="margin: 0 0 16px;">The address they used is not a Coconut Hub account, so there is ' +
    "no confirmed name to print on it.</p>" +
    '<table style="border-collapse: collapse; margin: 0 0 16px;">' +
    '<tr><td style="padding: 3px 16px 3px 0; color: #6b7280;">Email used</td>' +
    '<td style="padding: 3px 0;">' + escapeHtml(row.email) + "</td></tr>" +
    '<tr><td style="padding: 3px 16px 3px 0; color: #6b7280;">Finished</td>' +
    '<td style="padding: 3px 0;">' + escapeHtml(finished) + "</td></tr></table>" +
    '<p style="margin: 0 0 16px;">Their progress is recorded either way, and they did not need to ' +
    "repeat anything.</p>" +
    '<p style="margin: 0; font-size: 13px; color: #6b7280;">If this is someone we know, add or ' +
    "correct the address in Coconut Hub and ask them to open the course again with it. The " +
    "certificate goes out on the next completion.</p>" +
    "</div>";

  return await resend({
    to: NOTIFY,
    subject: "No certificate sent: " + row.email + " is not in Coconut Hub",
    html,
    text,
  }, "no-certificate notice");
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
        /* An address the Hub does not hold used to be turned away at the door,
           which meant a VA who typed their personal email could not take the
           course at all. It now enrols like anyone else: the material is a
           security awareness course whose one-pager is already public, so the
           gate was never protecting much, and the cost of the gate was people
           not being trained.

           Two things follow, and both are deliberate. There is no certificate
           at the end, because there is no confirmed name to print. And the
           endpoint no longer answers "is this a Coconut account" differently
           depending on the answer, which quietly removes the enumeration
           problem the old branch had.

           ALWAYS_ALLOWED stays: it is now only about the row being recorded
           under a name, not about who may enter. */
        await rpc("security_course_record", {
          p_email: email,
          p_name: null,
          p_user_id: null,
          p_step: 0,
          p_completed: false,
        });
        return json({ found: true, email, name: "", hub: false });
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

      return json({ found: true, email: canonical, name: user.name ?? "", hub: true });
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

      /* The certificate, claimed and settled separately from the team email
         above. Separate because they fail for different reasons and neither
         should be able to swallow the other: a PDF that will not build must
         still leave the team notified, and a Resend outage on the team email
         must not cost somebody their certificate. */
      let certificate: string | null = null;
      if (completed) {
        try {
          const hubUser = await findHubUser(email);
          const claim = await rpc("security_course_claim_certificate", {
            p_email: email,
            p_hub_matched: Boolean(hubUser),
          });

          if (claim && claim.completed_at) {
            let ok = false;
            if (hubUser) {
              ok = await sendCertificateEmail({
                // The Hub's name, not the one typed at enrolment.
                name: hubUser.name ?? claim.name ?? null,
                email: claim.email,
                completed_at: claim.completed_at,
                certificate_id: claim.certificate_id,
              });
              if (ok) certificate = claim.certificate_id;
            } else {
              ok = await sendNoCertificateNotice({
                name: claim.name ?? null,
                email: claim.email,
                completed_at: claim.completed_at,
              });
            }
            /* Hand the claim back on failure, exactly as the team email does.
               Left claimed, a refused send would be indistinguishable from a
               delivered one for ever. */
            if (!ok) await rpc("security_course_release_certificate", { p_email: email });
          }
        } catch (e) {
          console.error("security-course: certificate step failed", e);
          try {
            await rpc("security_course_release_certificate", { p_email: email });
          } catch (_e) {
            console.error("security-course: could not release the certificate claim", email);
          }
        }
      }

      return json({
        ok: true,
        last_step: row?.last_step ?? null,
        completed: Boolean(row?.completed_at),
        notified,
        certificate,
      });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error("security-course: unexpected error", e);
    return json({ error: "Server error." }, 500);
  }
});
