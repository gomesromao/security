# Coconut Security Essentials

Security awareness material for Coconut virtual professionals, built as two **separate,
independent deliverables** that happen to live in the same repository.

Either one can ship on its own. They also link to each other, so they can be used together.

| | What it is | Where |
|---|---|---|
| **1. The one-pager** | A complete, self-contained summary of the security ground rules. Read it in five minutes, keep it, print it. No interaction required. | [`index.html`](index.html) → `/` |
| **2. The course** | The same nine topics as a step-by-step course with hands-on exercises and a progress bar (`Step X of 9`). About thirty minutes. | [`course/index.html`](course/index.html) → `/course/` |

The one-pager is the right answer if the team just wants something to read and share.
The course is the right answer if we want people to *practise* rather than skim. Running
both is also fine. The one-pager ends with a link into the course, and the course ends
with a link back to the one-pager.

---

## The nine topics

Both deliverables cover the same ground, so the messaging stays consistent:

1. **Phishing, smishing & vishing**: fake messages by email, SMS and phone
2. **Impersonation & urgent requests**: someone posing as a client, a manager or a vendor
3. **Passwords, 2FA & account access**: length, uniqueness, password managers, codes
4. **Devices, browsers & downloads**: locking, updates, fake install prompts, lookalike URLs
5. **Malware & ransomware**: how it arrives, how it spreads through shared drives, first moves
6. **Client data & confidentiality**: what counts as personal data, where each thing belongs
7. **Working safely with AI**: what never gets pasted, and why the tool is not the risk
8. **Payments & card details**: card data, bank-detail changes, gift cards, the recall window
9. **Spotting trouble & speaking up**: the signals, connected apps, named access, reporting fast

## What the course exercises actually do

Each step unlocks its **Continue** button only once the exercise is finished, so
"completed" means something:

| Step | Exercise | Type |
|---|---|---|
| 1 | Find all five red flags in a suspicious email | clickable hotspots |
| 2 | Respond to an urgent gift-card request from a "client" on a new number | multiple choice |
| 3 | Inspect four passwords, then handle a caller asking for a 2FA code | reveal + multiple choice |
| 4 | Pick the three fake addresses out of six (`rn`/`m`, `1`/`l`, `0`/`o`) | find them all |
| 5 | Put the first four moves of a ransomware response in order | ordering, validated per click |
| 6 | Sort four work items into client system, password manager, or delete | three-way sort |
| 7 | Strip the five things that should not be in an AI prompt | clickable hotspots |
| 8 | Five true/false statements on handling money and card details | true / false round |
| 9 | Choose the first move when an account posts on its own, then the first-hour sequence | multiple choice + checklist |

Every step's **Continue** button stays locked until its exercise is finished, and says so
in the amber note beside it. The two find-them-all exercises carry a "Stuck? Reveal one"
button so nobody can dead-end.

---

## Design

Built directly on the **Coconut VA Design System v1.0**
([design-kit-drab.vercel.app](https://design-kit-drab.vercel.app/)).
`assets/tokens.css` is that system's token file, unmodified: navy + green core, cream
and mint surfaces, Manrope, pill buttons, generous radii, soft low-spread shadows.
`assets/app.css` builds the shared shell (header, buttons, cards, sections, CTA bar,
footer) on top of those tokens, so a change to the brand tokens flows through both pages.

Layout takes its lead from `coconutcareers.lovable.app`, with a centred hero carrying a green
highlight in the display type, a mint stat strip, and white cards with soft shadows.

Icons are an inline SVG sprite (stroke icons in navy and mint pucks), not emoji, so they
render identically on every machine.

The favicon is the ring symbol from coconutva.com, set on the brand navy so it survives
being shrunk to 16px. The site's own version is a pale gradient on transparency and
disappears at tab size; the shape is unchanged, only the ground behind it.

No copy anywhere uses an em-dash.

## Who gets in, and what we record

The **one-pager at `/` is open.** No email, no gate. It is the summary we want people to
read, keep and pass on, and putting a door in front of that only reduces the number of
people who read it.

**The course at `/course/` asks for an email.** There is no password. A reader types the
work email they already use for Coconut Hub, and if Coconut Hub knows that address they
are in, for thirty days.

Be clear about what that is: **identification, not authentication.** It tells us who is
taking the course and keeps the material off the open web. It does not prove the person at
the keyboard owns that mailbox, and it is not meant to. Nothing behind the door is worth
more than the one-pager that is already public, and the thing we actually need is a list of
who has done the training.

### What happens on the way in

1. The reader posts their address to `/api/enroll`, a function on our side.
2. That function calls one Coconut Hub edge function, `security-course`, over a shared
   secret. The edge function looks the address up in Hub's `public.users` and answers yes
   or no.
3. On a yes, the browser receives a session for **this site only**: an HMAC-signed cookie,
   `HttpOnly` / `Secure` / `SameSite=Lax`, good for thirty days.

This site holds **no Coconut Hub key of any kind**. Not the anon key, not the service role.
The only credential it has for Hub is the shared secret for that one edge function, and the
worst anyone can do with it is record course progress. It cannot read the Hub, cannot write
anything else, and cannot sign in as anyone.

`middleware.js` is the gate, and its protected list is one line: `/course`. If
`SESSION_SECRET` is ever missing it returns 503 rather than falling open.

The honest weak spot: an endpoint that answers "is this address a Coconut account" is an
endpoint somebody can use to find out who works here, one guess at a time. `/api/enroll`
carries two brakes, an origin check and a window in memory, and neither is a wall. The
window lives in one warm Vercel instance, so a caller spread across instances gets around
it. It catches the lazy case. If this ever needs to be real, it needs a shared store and
probably a code sent to the address, not a bigger number in the file.

### What gets stored

One row per person, in one new table on Coconut Hub, `public.security_course_progress`:
their email, their name, the furthest step they reached, when they started, when they were
last seen, and when they finished.

The course page posts to `/api/progress` every time someone moves forward. It is silent by
design: no spinner, no error, no retry, nothing that can interrupt somebody halfway through
a security course. If the call fails, the reader never knows and the course carries on.
Identity comes from the signed cookie, never from the request body, so the only thing a
browser can influence is its own step number.

Steps only ever move forward, and a completion timestamp is never overwritten.

### The completion email

The first time somebody reaches the end, one email goes to **daniel@**, **jeem@** and
**hr@**, from `hr@coconutva.com` through Resend. It names the person, their email, when
they finished, and that they covered nine of nine steps.

Once per person, ever. The right to send it is claimed with an atomic update inside
Postgres, so two requests arriving together cannot produce two emails.

### What was added to Coconut Hub

Additively, and nothing else was touched:

- `public.security_course_progress`, a new table. RLS on. **No policy grants an insert, an
  update or a delete to anybody**, so the only writer is the service role inside the edge
  function. HR can read it (`is_user_hr(auth.uid())`, the helper Hub already uses), and
  `anon` has no grant on it at all.
- `security_course_record()` and `security_course_claim_notification()`, two
  `security definer` functions, execute revoked from `public`, `anon` and `authenticated`,
  granted only to `service_role`.
- `security-course`, a new edge function. Source lives in this repo under
  `supabase/functions/` so it is not only in the dashboard. No CORS header, on purpose: it
  is server to server only and a browser can never call it.

No existing table, policy, function or edge function was modified.

### Environment variables

| Name | Where | What it is |
|---|---|---|
| `HUB_URL` | Vercel | The Coconut Hub Supabase URL, no trailing slash |
| `SESSION_SECRET` | Vercel | A long random string, ours alone. Rotating it signs everyone out |
| `COURSE_API_SECRET` | Vercel **and** Hub | The shared secret for the `security-course` edge function. The same value has to be set in both places |

`HUB_ANON_KEY` is no longer used and can be removed from the project.

None of these are in this repository, and the repository is public.

## Deliberately not included

- **No accounts of our own.** No second user table, no passwords, no reset flow, nothing to
  provision. The door checks an address against Hub and that is all.
- **No tracking or analytics.** No third party sees anything. The course still keeps its
  own state in the visitor's browser (`localStorage`), which is what lets it work offline
  and on a phone with storage blocked. The only thing that leaves the page is the step
  number, to our own function, so the team can see who has done the training.
- **No bundler.** Static HTML and CSS, one small script, three short functions. The only
  dependency is `@vercel/edge`, used by the gate.

## Running it

The pages themselves are still plain static files, so a static server renders them with
the gate out of the picture, which is the quickest way to work on content:

```bash
python -m http.server 8000
# → http://127.0.0.1:8000/         the one-pager
# → http://127.0.0.1:8000/course/  the course
```

To exercise the door and the gate as well, run the Vercel dev server instead, with the
variables above set in `.env.local`:

```bash
npx vercel dev
# → http://localhost:3000/start
```

## Deploying

Vercel, from `main`. The static files are served as they are and there is no build command,
but the project does need the environment variables above and the two pieces that use them:
`middleware.js` at the root and the functions in `api/`. A host that only serves static
files would still render both deliverables, with the course ungated.

The Hub edge function deploys separately:

```bash
npx supabase functions deploy security-course   --project-ref liknubnqxglsfkzfgyid --no-verify-jwt
```

## Content credit

The topic coverage draws on two sources. The first is
[`emreugurlu/open-security-training`](https://github.com/emreugurlu/open-security-training),
an open set of interactive security and privacy modules with SCORM support. The second is
LinkedIn Learning's *Cybersecurity Foundations* and its security topic catalogue.

Neither is reproduced here. Both were used to check what a security curriculum is expected
to cover, and the writing is original throughout.

Most of what those sources contain does not belong in front of a virtual professional.
NIST and COBIT frameworks, rootkits and process hiding, zero trust architecture, SBOMs and
supply chain security, OWASP and secure coding, cyber diplomacy: all governance or
engineering material, all dropped. What was worth taking became the four things this course
gained: **ransomware** as its own step rather than a passing mention, **AI safety** as its
own step because VAs use these tools daily, **payments and card data** as its own step, and
a **detection** section in the final step, because the original taught people to report
quickly without teaching them how to notice anything in the first place.

If we ever do want LMS-hosted, per-person completion records, that upstream repository
also has a working SCORM 1.2 manifest and packaging script worth borrowing.
