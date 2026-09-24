// Generates test-files/mixed-pages.pdf: pages of different sizes, a rotated
// page and a page with a CropBox smaller than its MediaBox. Each page states
// the size it should have after import, so a manual check in Photoshop is
// just "does the layer match its label". Run with `npm run test-pdf`.
//
// Text is ASCII only: pdf-lib's standard fonts cannot encode Cyrillic.
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, PageSizes, degrees, rgb } = require("pdf-lib");

const RESOLUTION = 300;
const px = (pt) => Math.round((pt * RESOLUTION) / 72);
const fmt = (n) => Number(n.toFixed(2));

const [A4W, A4H] = PageSizes.A4;

/**
 * width/height: MediaBox. crop: optional [x, y, w, h] CropBox.
 * rotate: /Rotate value. expected: size as Photoshop should show the page.
 */
const PAGES = [
  { width: A4W, height: A4H, note: "A4 portrait" },
  { width: A4H, height: A4W, note: "A4 landscape" },
  { width: 300, height: 300, note: "Small square" },
  { width: A4W, height: A4H, rotate: 90, note: "A4 with /Rotate 90: arrow must point RIGHT" },
  // 432 x 504 pt = exactly 1800 x 2100 px at 300 ppi, so no fractional edge
  // pixel can pick up the red area outside the CropBox.
  { width: 600, height: 800, crop: [84, 148, 432, 504], note: "CropBox 432x504: no RED may be visible" },
];

function expectedSize({ width, height, crop, rotate = 0 }) {
  const [w, h] = crop ? [crop[2], crop[3]] : [width, height];
  return rotate % 180 === 0 ? { width: w, height: h } : { width: h, height: w };
}

async function build() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const small = await pdf.embedFont(StandardFonts.Helvetica);

  PAGES.forEach((spec, i) => {
    const page = pdf.addPage([spec.width, spec.height]);
    const [x, y, w, h] = spec.crop || [0, 0, spec.width, spec.height];

    if (spec.crop) {
      // Area outside the CropBox: must never show up after import.
      page.drawRectangle({ x: 0, y: 0, width: spec.width, height: spec.height, color: rgb(1, 0, 0) });
      page.setCropBox(x, y, w, h);
    }
    if (spec.rotate) page.setRotation(degrees(spec.rotate));

    // Light background over the whole visible area, then a 2 pt border
    // drawn fully inside it.
    page.drawRectangle({ x, y, width: w, height: h, color: rgb(0.93, 0.96, 1) });
    page.drawRectangle({
      x: x + 1,
      y: y + 1,
      width: w - 2,
      height: h - 2,
      borderColor: rgb(0.1, 0.35, 0.9),
      borderWidth: 2,
    });
    // Corner marker: top-left of the unrotated page.
    page.drawRectangle({ x: x + 2, y: y + h - 22, width: 20, height: 20, color: rgb(0.1, 0.35, 0.9) });

    // "Up" arrow along the unrotated page's vertical axis.
    const cx = x + w / 2;
    const top = y + h - 30;
    const len = Math.min(60, h * 0.1);
    const head = len * 0.3;
    page.drawLine({ start: { x: cx, y: top - len }, end: { x: cx, y: top }, thickness: 4 });
    page.drawLine({ start: { x: cx - head, y: top - head }, end: { x: cx, y: top }, thickness: 4 });
    page.drawLine({ start: { x: cx + head, y: top - head }, end: { x: cx, y: top }, thickness: 4 });

    const exp = expectedSize(spec);
    const lines = [
      { text: `Page ${i + 1}`, size: Math.min(48, w / 6), font },
      { text: spec.note, size: Math.min(12, w / 30), font: small },
      { text: `${fmt(exp.width)} x ${fmt(exp.height)} pt`, size: Math.min(16, w / 20), font: small },
      { text: `${px(exp.width)} x ${px(exp.height)} px @ ${RESOLUTION} ppi`, size: Math.min(16, w / 20), font: small },
    ];
    let ty = y + h / 2;
    for (const line of lines) {
      const tw = line.font.widthOfTextAtSize(line.text, line.size);
      page.drawText(line.text, { x: cx - tw / 2, y: ty, size: line.size, font: line.font, color: rgb(0.1, 0.1, 0.1) });
      ty -= line.size * 1.6;
    }
  });

  return pdf.save();
}

module.exports = { PAGES, expectedSize, build };

if (require.main === module) {
  build().then((bytes) => {
    const out = path.join(__dirname, "..", "test-files", "mixed-pages.pdf");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, bytes);
    console.log("wrote", path.relative(process.cwd(), out));
    PAGES.forEach((spec, i) => {
      const e = expectedSize(spec);
      console.log(`  page ${i + 1}: ${px(e.width)} x ${px(e.height)} px — ${spec.note}`);
    });
  });
}
