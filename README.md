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

The whole repository is the site. Publish it as-is to GitHub Pages, Vercel, Netlify or
anything else that serves static files. No configuration, no environment variables, no
build command.

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
