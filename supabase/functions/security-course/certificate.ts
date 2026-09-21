/* ======================================================================
   The certificate, drawn rather than rendered.

   The approved design was built as HTML and printed by headless Chrome. No
   Chrome exists here and shipping one would mean a container an order of
   magnitude larger than this function, so the same layout is redrawn in
   pdf-lib primitives: one navy rectangle, an image, some text, nine dots and
   a set of hairlines. That is the whole design, which is what made the
   minimal option the practical one as well as the prettier one.

   Two consequences worth knowing. Positions are millimetres measured from the
   top left, converted once at the edge, because that is how the CSS read and
   it keeps the two comparable. And letter-spacing does not exist in pdf-lib,
   so the tracked uppercase labels are drawn a character at a time.

   The syllabus is passed in, never hardcoded. It comes from the same course
   page the reader just finished, so renaming a step renames it here too.
   ====================================================================== */
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";

const MM = 2.834645669;            // 1 mm in PDF points
const PAGE_W = 297 * MM;           // A4 landscape
const PAGE_H = 210 * MM;

const NAVY = rgb(0.0431, 0.1176, 0.2471);   // #0B1E3F
const MINT_PALE = rgb(0.7529, 0.8980, 0.8235); // #C0E5D2
const INK_SOFT = rgb(0.7843, 0.8235, 0.8863); // #C8D2E2
const FG1 = rgb(0.0275, 0.0824, 0.1686);    // #07152B
const FG2 = rgb(0.1647, 0.2275, 0.3333);    // #2A3A55
const FG3 = rgb(0.3608, 0.4196, 0.5216);    // #5C6B85
const MINT = rgb(0.9176, 0.9608, 0.9333);   // #EAF5EE
const GREEN = rgb(0.3137, 0.6902, 0.5020);  // #50B080
const BORDER = rgb(0.9020, 0.9098, 0.9333); // #E6E8EE
const WHITE = rgb(1, 1, 1);

export type Syllabus = { n: number; title: string }[];

export type CertificateInput = {
  name: string;
  completedAt: string;   // ISO
  certificateId: string;
  syllabus: Syllabus;
  verifyUrl?: string | null;
  assetBase: string;     // where the fonts and the white logo live
};

/* Assets are fetched once per warm instance. They are a few hundred KB and
   they never change between completions, so paying for them on every issue
   would be the slowest part of this function by a distance. */
let cache: {
  regular: Uint8Array; semi: Uint8Array; bold: Uint8Array; logo: Uint8Array;
} | null = null;

async function loadAssets(base: string) {
  if (cache) return cache;
  const grab = async (path: string) => {
    const r = await fetch(base + path);
    if (!r.ok) throw new Error("asset " + path + " -> " + r.status);
    return new Uint8Array(await r.arrayBuffer());
  };
  const [regular, semi, bold, logo] = await Promise.all([
    grab("/assets/fonts/Manrope-400.ttf"),
    grab("/assets/fonts/Manrope-600.ttf"),
    grab("/assets/fonts/Manrope-800.ttf"),
    grab("/assets/logo-white.png"),
  ]);
  cache = { regular, semi, bold, logo };
  return cache;
}

const fromTop = (mm: number) => PAGE_H - mm * MM;

export async function buildCertificate(input: CertificateInput): Promise<Uint8Array> {
  const { name, completedAt, certificateId, syllabus, verifyUrl, assetBase } = input;
  const assets = await loadAssets(assetBase);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(assets.regular, { subset: true });
  const semi = await pdf.embedFont(assets.semi, { subset: true });
  const bold = await pdf.embedFont(assets.bold, { subset: true });
  const logo = await pdf.embedPng(assets.logo);

  pdf.setTitle("Cyber Security Awareness — Certificate of Completion");
  pdf.setAuthor("Coconut Virtual Professionals");
  pdf.setSubject("Certificate " + certificateId);
  pdf.setProducer("Coconut Security");
  pdf.setCreator("Coconut Security");

  const page = pdf.addPage([PAGE_W, PAGE_H]);

  /* ---------- helpers ---------- */

  // pdf-lib has no letter-spacing, and the uppercase labels lean on it hard
  // enough that dropping it would change the design. One character at a time.
  const tracked = (
    text: string, xmm: number, ymm: number,
    size: number, font: typeof bold, color: ReturnType<typeof rgb>, em: number,
  ) => {
    let x = xmm * MM;
    const y = fromTop(ymm);
    const extra = size * em;
    for (const ch of text) {
      page.drawText(ch, { x, y, size, font, color });
      x += font.widthOfTextAtSize(ch, size) + extra;
    }
  };

  const text = (
    s: string, xmm: number, ymm: number,
    size: number, font: typeof regular, color: ReturnType<typeof rgb>,
  ) => page.drawText(s, { x: xmm * MM, y: fromTop(ymm), size, font, color });

  // Wrapping by measurement rather than by character count, because the only
  // long strings here are a person's name and one sentence, and both have to
  // sit inside a column whose width is fixed by the panel.
  const wrap = (s: string, font: typeof regular, size: number, widthMm: number) => {
    const max = widthMm * MM;
    const out: string[] = [];
    let line = "";
    for (const word of s.split(/\s+/)) {
      const next = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(next, size) > max && line) { out.push(line); line = word; }
      else line = next;
    }
    if (line) out.push(line);
    return out;
  };

  /* ---------- left panel ---------- */

  const PANEL_W = 88;
  page.drawRectangle({
    x: 0, y: 0, width: PANEL_W * MM, height: PAGE_H, color: NAVY,
  });

  const logoH = 8;
  const logoW = logoH * (logo.width / logo.height);
  page.drawImage(logo, {
    x: 14 * MM, y: fromTop(17 + logoH), width: logoW * MM, height: logoH * MM,
  });

  tracked("CERTIFICATE OF", 14, 89.5, 7.6, bold, MINT_PALE, 0.13);
  tracked("COMPLETION", 14, 93.7, 7.6, bold, MINT_PALE, 0.13);

  text("Cyber Security", 14, 106, 17, bold, WHITE);
  text("Awareness", 14, 114.4, 17, bold, WHITE);

  const sub = wrap(
    "The " + syllabus.length + "-part security awareness programme for virtual professionals at Coconut.",
    regular, 9.5, 60,
  );
  sub.forEach((line, i) => text(line, 14, 124 + i * 5.6, 9.5, regular, INK_SOFT));

  page.drawLine({
    start: { x: 14 * MM, y: fromTop(148) }, end: { x: (PANEL_W - 14) * MM, y: fromTop(148) },
    thickness: 0.4, color: rgb(1, 1, 1), opacity: 0.16,
  });

  // Built as a list so the verify line can simply be absent when there is no
  // page to verify against, rather than pointing at a dead address.
  const meta: [string, string][] = [
    ["DATE OF COMPLETION", new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Manila",
    }).format(new Date(completedAt))],
    ["CERTIFICATE", certificateId],
  ];
  if (verifyUrl) meta.push(["VERIFY AT", verifyUrl]);

  let my = 157;
  for (const [label, value] of meta) {
    tracked(label, 14, my, 7, bold, MINT_PALE, 0.13);
    text(value, 14, my + 6.2, 9.5, regular, WHITE);
    my += 15;
  }

  /* ---------- right side ---------- */

  const MAIN_X = 106;
  const MAIN_W = 173;

  text("This certifies that", MAIN_X, 57.5, 10.5, regular, FG3);

  // A long name has to shrink rather than run off the page or wrap into the
  // sentence below it. Three sizes is enough for anything realistic.
  let nameSize = 30;
  for (const size of [30, 25, 21]) {
    nameSize = size;
    if (bold.widthOfTextAtSize(name, size) <= MAIN_W * MM) break;
  }
  text(name, MAIN_X, 70.5, nameSize, bold, NAVY);

  // Drawn in three runs so the course name can be bold inside the sentence,
  // which is what the approved design does.
  {
    const size = 10.5;
    const pre = "has completed ";
    const mid = "Cyber Security Awareness Training";
    const post = " and covered every topic below:";
    let x = MAIN_X * MM;
    const y = fromTop(85.5);
    page.drawText(pre, { x, y, size, font: regular, color: FG2 });
    x += regular.widthOfTextAtSize(pre, size);
    page.drawText(mid, { x, y, size, font: bold, color: NAVY });
    x += bold.widthOfTextAtSize(mid, size);
    page.drawText(post, { x, y, size, font: regular, color: FG2 });
  }

  tracked("TOPICS COVERED", MAIN_X, 101.5, 9, bold, FG3, 0.16);

  // Two columns filled across, the way the CSS grid did, so the reading order
  // on the page matches the order of the course.
  const COL_X = [MAIN_X, MAIN_X + 92];
  const COL_W = 82;
  const ROW_H = 9.55;
  syllabus.forEach((step, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = COL_X[col];
    const y = 112.5 + row * ROW_H;

    page.drawCircle({
      x: (x + 1.7) * MM, y: fromTop(y - 1.1), size: 1.7 * MM, color: MINT,
    });
    page.drawCircle({
      x: (x + 1.7) * MM, y: fromTop(y - 1.1), size: 0.62 * MM, color: GREEN,
    });
    text(step.title, x + 5.2, y, 10, regular, FG2);
    page.drawLine({
      start: { x: x * MM, y: fromTop(y + 3.1) },
      end: { x: (x + COL_W) * MM, y: fromTop(y + 3.1) },
      thickness: 0.4, color: BORDER,
    });
  });

  return await pdf.save();
}
