const { app, core, constants } = require("photoshop");
const { storage } = require("uxp");
const { placePdfPage } = require("./psActions");

/** Resolution of documents created by the plugin. */
const NEW_DOC_RESOLUTION = 300;

const POINTS_PER_INCH = 72;

/** Target document for the import. */
const Target = { NEW: "new", CURRENT: "current" };

/** How each page becomes a layer. */
const Mode = { RASTER: "raster", SMART: "smart" };

class CancelledError extends Error {
  constructor() {
    super("Импорт отменён");
    this.name = "CancelledError";
  }
}

function pointsToPixels(points, resolution) {
  return Math.round((points * resolution) / POINTS_PER_INCH);
}

function boundsSize(layer) {
  const b = layer.boundsNoEffects;
  return { left: b.left, top: b.top, width: b.right - b.left, height: b.bottom - b.top };
}

/**
 * Brings a freshly placed layer to the page's native size (Photoshop may
 * shrink it to fit the canvas) and moves it to the canvas' top-left corner.
 */
async function normalizePlacedLayer(layer, pageSize, resolution) {
  const expectedW = pointsToPixels(pageSize.width, resolution);
  const expectedH = pointsToPixels(pageSize.height, resolution);
  let b = boundsSize(layer);

  const sameAspect =
    b.width > 0 &&
    b.height > 0 &&
    Math.abs(expectedW / expectedH - b.width / b.height) < 0.01;
  const offBy = Math.max(Math.abs(b.width - expectedW), Math.abs(b.height - expectedH));

  // Only rescale when Photoshop kept the page proportions; otherwise the crop
  // box differs from what pdf-lib reported and we trust Photoshop's size.
  if (sameAspect && offBy > 1) {
    const pct = (expectedW / b.width) * 100;
    await layer.scale(pct, pct, constants.AnchorPosition.TOPLEFT);
    b = boundsSize(layer);
  }

  if (b.left !== 0 || b.top !== 0) {
    await layer.translate(-b.left, -b.top);
  }
}

/**
 * Imports the given PDF pages as layers. Page 1 ends up on top.
 *
 * @param {object} opts
 * @param {import("uxp").storage.File} opts.file
 * @param {{pageCount: number, sizes: {width: number, height: number}[]}} opts.info
 * @param {number[]} opts.pages 1-based, ascending
 * @param {"raster"|"smart"} opts.mode
 * @param {"new"|"current"} opts.target
 * @param {(msg: string) => void} [opts.onStatus]
 */
async function importPages({ file, info, pages, mode, target, onStatus = () => {} }) {
  if (target === Target.CURRENT && !app.activeDocument) {
    throw new Error("Нет открытого документа");
  }

  const token = storage.localFileSystem.createSessionToken(file);

  return core.executeAsModal(
    async (ctx) => {
      let doc;
      if (target === Target.NEW) {
        const maxW = Math.max(...pages.map((p) => info.sizes[p - 1].width));
        const maxH = Math.max(...pages.map((p) => info.sizes[p - 1].height));
        doc = await app.documents.add({
          name: file.name.replace(/\.pdf$/i, ""),
          width: pointsToPixels(maxW, NEW_DOC_RESOLUTION),
          height: pointsToPixels(maxH, NEW_DOC_RESOLUTION),
          resolution: NEW_DOC_RESOLUTION,
          mode: constants.NewDocumentMode.RGB,
          fill: constants.DocumentFill.TRANSPARENT,
        });
      } else {
        doc = app.activeDocument;
      }

      const suspension = await ctx.hostControl.suspendHistory({
        documentID: doc.id,
        name: `Импорт PDF: ${file.name}`,
      });

      const blankLayer = target === Target.NEW ? doc.layers[0] : null;
      let committed = false;
      try {
        // Place from the last page to the first: each placed layer lands
        // above the active one, so page 1 ends up on top.
        const order = [...pages].reverse();
        for (let i = 0; i < order.length; i++) {
          if (ctx.isCancelled) throw new CancelledError();

          const pageNumber = order[i];
          const msg = `Страница ${pageNumber} (${i + 1} из ${order.length})`;
          onStatus(msg);
          ctx.reportProgress({ value: i / order.length, commandName: msg });

          await placePdfPage(token, pageNumber);
          const layer = doc.activeLayers[0];
          await normalizePlacedLayer(layer, info.sizes[pageNumber - 1], doc.resolution);
          if (mode === Mode.RASTER) {
            await layer.rasterize(constants.RasterizeType.ENTIRELAYER);
          }
          layer.name = `Page ${pageNumber}`;
        }

        // A new document starts with an empty transparent "Layer 1".
        if (blankLayer) await blankLayer.delete();

        await ctx.hostControl.resumeHistory(suspension, true);
        committed = true;
      } finally {
        if (!committed) {
          // Roll back everything done inside this history step.
          await ctx.hostControl.resumeHistory(suspension, false);
          if (target === Target.NEW) await doc.closeWithoutSaving();
        }
      }

      ctx.reportProgress({ value: 1 });
      return pages.length;
    },
    { commandName: "Импорт PDF в слои" }
  );
}

module.exports = { importPages, Target, Mode, CancelledError, NEW_DOC_RESOLUTION };
