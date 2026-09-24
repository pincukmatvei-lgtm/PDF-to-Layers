const { PDFDocument } = require("pdf-lib");

/**
 * Reads page count and page sizes from PDF bytes. Rendering is left to
 * Photoshop; pdf-lib is only used for metadata.
 *
 * Sizes are in PDF points (1/72 inch) as Photoshop shows the page: the crop
 * box (which falls back to the media box), with width and height swapped for
 * pages rotated by 90/270 degrees.
 *
 * @param {ArrayBuffer|Uint8Array} bytes
 * @returns {Promise<{pageCount: number, sizes: {width: number, height: number}[]}>}
 */
async function getPdfInfo(bytes) {
  let pdf;
  try {
    pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
  } catch (e) {
    throw new Error(`Не удалось прочитать PDF: ${e.message}`);
  }

  const sizes = pdf.getPages().map((page) => {
    const box = page.getCropBox();
    const angle = ((page.getRotation().angle % 360) + 360) % 360;
    const swap = angle === 90 || angle === 270;
    return swap
      ? { width: box.height, height: box.width }
      : { width: box.width, height: box.height };
  });

  return { pageCount: sizes.length, sizes };
}

module.exports = { getPdfInfo };
