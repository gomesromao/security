# Coconut — Security Essentials

Security awareness material for Coconut virtual professionals, built as two **separate,
independent deliverables** that happen to live in the same repository.

Either one can ship on its own. They also link to each other, so they can be used together.

| | What it is | Where |
|---|---|---|
| **1. The one-pager** | A complete, self-contained summary of the security ground rules. Read it in five minutes, keep it, print it. No interaction required. | [`index.html`](index.html) → `/` |
| **2. The course** | The same six topics as a step-by-step course with hands-on exercises and a progress bar (`Step X of 6`). About twenty minutes. | [`course/index.html`](course/index.html) → `/course/` |

The one-pager is the right answer if the team just wants something to read and share.
The course is the right answer if we want people to *practise* rather than skim. Running
both is also fine — the one-pager ends with a link into the course, and the course ends
with a link back to the one-pager.

---

## The six topics

Both deliverables cover the same ground, so the messaging stays consistent:

1. **Phishing, smishing & vishing** — fake messages by email, SMS and phone
2. **Impersonation & urgent requests** — someone posing as a client, a manager or a vendor
3. **Passwords, 2FA & account access** — length, uniqueness, password managers, codes
4. **Devices, browsers & downloads** — locking, updates, fake install prompts, lookalike URLs
5. **Client data & confidentiality** — what counts as personal data, approved tools, AI tools
6. **Client accounts & speaking up** — named access, connected apps, reporting fast

## What the course exercises actually do

Each step unlocks its **Continue** button only once the exercise is finished, so
"completed" means something:

| Step | Exercise |
|---|---|
| 1 | Find all five red flags in a suspicious email (clickable hotspots, each explained) |
| 2 | Decide how to respond to an urgent gift-card request from a "client" on a new number |
| 3 | Inspect four passwords to see why three of them fail, then handle a caller asking for a 2FA code |
| 4 | Pick the three fake addresses out of six, including the `rn`/`m`, `1`/`l` and `0`/`o` tricks |
| 5 | Sort four real work items into the right home: client system, password manager, or delete |
| 6 | Choose the first move when a client account posts on its own, then confirm the first-hour sequence |

---

## Design

Built directly on the **Coconut VA Design System v1.0**
([design-kit-drab.vercel.app](https://design-kit-drab.vercel.app/)).
`assets/tokens.css` is that system's token file, unmodified — navy + green core, cream
and mint surfaces, Manrope, pill buttons, generous radii, soft low-spread shadows.
`assets/app.css` builds the shared shell (header, buttons, cards, sections, CTA bar,
footer) on top of those tokens, so a change to the brand tokens flows through both pages.

Layout takes its lead from `coconutcareers.lovable.app` — centred hero with a green
highlight in the display type, a mint stat strip, and white cards with soft shadows.

Icons are an inline SVG sprite (stroke icons in mint pucks), not emoji, so they render
identically on every machine.

## Deliberately not included

- **No login.** Nothing to sign into, nothing to provision. If the course is approved we
  can revisit accounts and real completion tracking then.
- **No tracking or analytics.** Nothing is sent anywhere. Course progress is kept in the
  visitor's own browser (`localStorage`), so someone can stop and pick up where they left
  off, and that is the only state that exists.
- **No build step.** Static HTML, CSS and one inline script. No dependencies, no bundler.

## Running it

Any static server will do:

```bash
python -m http.server 8000
# → http://127.0.0.1:8000/         the one-pager
# → http://127.0.0.1:8000/course/  the course
```

Opening `index.html` straight from disk also works.

## Deploying

The whole repository is the site — publish it as-is to GitHub Pages, Vercel, Netlify or
anything else that serves static files. No configuration, no environment variables, no
build command.

## Content credit

The topic coverage and several scenario ideas are adapted from
[`emreugurlu/open-security-training`](https://github.com/emreugurlu/open-security-training),
an open set of interactive security and privacy training modules with SCORM support.

That project ships six modules (including Secure Coding / OWASP Top 10) as large
standalone HTML files designed for an LMS. This repository reworks the material for
Coconut instead: the developer-focused module is dropped, the remaining content is
rewritten for a virtual professional handling client inboxes, accounts and data, and the
whole thing is rebuilt in Coconut's own design system as something we can host and share
ourselves.

If we ever do want LMS-hosted, per-person completion records, that upstream repository
also has a working SCORM 1.2 manifest and packaging script worth borrowing.
