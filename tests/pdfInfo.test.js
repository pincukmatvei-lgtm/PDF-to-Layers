const { PDFDocument, degrees } = require("pdf-lib");
const { getPdfInfo } = require("../src/pdfInfo");

async function makePdf(build) {
  const pdf = await PDFDocument.create();
  build(pdf);
  return pdf.save();
}

describe("getPdfInfo", () => {
  test("reports page count and sizes in points", async () => {
    const bytes = await makePdf((pdf) => {
      pdf.addPage([595, 842]); // A4 portrait
      pdf.addPage([842, 595]); // A4 landscape
    });
    const info = await getPdfInfo(bytes);
    expect(info.pageCount).toBe(2);
    expect(info.sizes).toEqual([
      { width: 595, height: 842 },
      { width: 842, height: 595 },
    ]);
  });

  test("uses the crop box when present", async () => {
    const bytes = await makePdf((pdf) => {
      const page = pdf.addPage([600, 800]);
      page.setCropBox(50, 50, 400, 500);
    });
    const info = await getPdfInfo(bytes);
    expect(info.sizes[0]).toEqual({ width: 400, height: 500 });
  });

  test("swaps dimensions for rotated pages", async () => {
    const bytes = await makePdf((pdf) => {
      pdf.addPage([300, 500]).setRotation(degrees(90));
      pdf.addPage([300, 500]).setRotation(degrees(180));
    });
    const info = await getPdfInfo(bytes);
    expect(info.sizes).toEqual([
      { width: 500, height: 300 },
      { width: 300, height: 500 },
    ]);
  });

  test("throws a readable error for non-PDF data", async () => {
    await expect(getPdfInfo(new TextEncoder().encode("not a pdf"))).rejects.toThrow(
      /Не удалось прочитать PDF/
    );
  });
});

describe("test-files/mixed-pages.pdf", () => {
  const fs = require("fs");
  const path = require("path");
  const { PAGES, expectedSize } = require("../scripts/make-test-pdf");

  test("matches the sizes printed on its pages", async () => {
    const bytes = fs.readFileSync(path.join(__dirname, "..", "test-files", "mixed-pages.pdf"));
    const info = await getPdfInfo(bytes);
    expect(info.pageCount).toBe(PAGES.length);
    info.sizes.forEach((size, i) => {
      const exp = expectedSize(PAGES[i]);
      expect(size.width).toBeCloseTo(exp.width, 2);
      expect(size.height).toBeCloseTo(exp.height, 2);
    });
    // Rotated page reads as landscape, cropped page as its CropBox.
    expect(info.sizes[3].width).toBeGreaterThan(info.sizes[3].height);
    expect(info.sizes[4]).toEqual({ width: 432, height: 504 });
  });
});
