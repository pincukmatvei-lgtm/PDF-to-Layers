const { action } = require("photoshop");

/**
 * Which PDF box Photoshop crops the page to. "cropBox" is the page as seen in
 * Acrobat and matches the sizes reported by pdfInfo.js, so every page keeps
 * its full geometry. Other values: boundingBox (content only — pages would
 * shift relative to each other), mediaBox, bleedBox, trimBox, artBox.
 */
const PDF_CROP = "cropBox";

/**
 * Places one PDF page into the active document as an embedded smart object.
 * Mirrors the recorded "Place" action:
 *   selection: page, pageNumber: N, crop, antiAlias, centered, offset 0.
 *
 * @param {string} fileToken session token from localFileSystem.createSessionToken
 * @param {number} pageNumber 1-based
 */
async function placePdfPage(fileToken, pageNumber) {
  await action.batchPlay(
    [
      {
        _obj: "placeEvent",
        null: { _path: fileToken, _kind: "local" },
        as: {
          _obj: "PDFGenericFormat",
          selection: { _enum: "pdfSelection", _value: "page" },
          pageNumber,
          crop: { _enum: "cropTo", _value: PDF_CROP },
          suppressWarnings: true,
          antiAlias: true,
        },
        freeTransformCenterState: {
          _enum: "quadCenterState",
          _value: "QCSAverage",
        },
        offset: {
          _obj: "offset",
          horizontal: { _unit: "distanceUnit", _value: 0 },
          vertical: { _unit: "distanceUnit", _value: 0 },
        },
        antiAlias: true,
        _options: { dialogOptions: "dontDisplay" },
      },
    ],
    {}
  );
}

module.exports = { placePdfPage, PDF_CROP };
