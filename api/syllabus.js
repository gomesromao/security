/* ======================================================================
   GET /api/syllabus  ->  { steps: [{ n, title }], total }

   The topic names, read out of the course page itself.

   The certificate lists every topic, and it is built in a Supabase edge
   function that cannot see this repository. The obvious source, the course
   page, is behind the gate: an unauthenticated fetch of /course/ gets a 307
   to /start, so the function would have parsed a redirect and found nothing.

   Copying the list into the function would have solved that and created the
   problem the whole arrangement exists to avoid -- two lists, one of them
   quietly out of date, and a certificate naming topics the course no longer
   teaches. So the page stays the single source and this route reads it from
   disk and hands back only the headings.

   Public on purpose. Topic names are the table of contents, not the
   material, and they already appear on the open one-pager. Nothing behind
   the gate is exposed by knowing that step 5 is about ransomware.
   ====================================================================== */

import { readFileSync } from "node:fs";
import { join } from "node:path";

// Parsed once per warm instance. The file cannot change without a redeploy,
// which gives every instance a fresh one anyway.
let cached = null;

function parse() {
  if (cached) return cached;

  const html = readFileSync(join(process.cwd(), "course", "index.html"), "utf8");
  const steps = [];
  const re = /data-step="(\d+)"[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/g;

  let m;
  while ((m = re.exec(html)) !== null) {
    const title = m[2]
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/&#39;|&rsquo;/g, "’")
      .trim();
    if (title) steps.push({ n: Number(m[1]), title });
  }

  steps.sort(function (a, b) { return a.n - b.n; });
  cached = steps;
  return cached;
}

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  let steps;
  try {
    steps = parse();
  } catch (e) {
    console.error("syllabus: could not read the course page", e);
    return res.status(500).json({ error: "Could not read the syllabus." });
  }

  /* An empty list is a failure, not an answer. Returning 200 with nothing in
     it would let a certificate go out listing no topics at all, which is the
     one outcome worse than no certificate. */
  if (!steps.length) {
    console.error("syllabus: the course page parsed to zero steps");
    return res.status(500).json({ error: "Could not read the syllabus." });
  }

  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  return res.status(200).json({ steps: steps, total: steps.length });
}
