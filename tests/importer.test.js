// Exercises importer.js against a minimal fake Photoshop DOM.

const mockPlaced = [];
let mockDoc;
let mockCancelAfter = Infinity;
const mockHistory = [];

function mockMakeLayer(name, bounds) {
  const layer = {
    name,
    boundsNoEffects: { ...bounds },
    rasterized: false,
    deleted: false,
    scale: jest.fn(async (pct) => {
      const b = layer.boundsNoEffects;
      const k = pct / 100;
      b.right = b.left + (b.right - b.left) * k;
      b.bottom = b.top + (b.bottom - b.top) * k;
    }),
    translate: jest.fn(async (dx, dy) => {
      const b = layer.boundsNoEffects;
      Object.assign(b, { left: b.left + dx, right: b.right + dx, top: b.top + dy, bottom: b.bottom + dy });
    }),
    rasterize: jest.fn(async () => {
      layer.rasterized = true;
    }),
    delete: jest.fn(async () => {
      layer.deleted = true;
      mockDoc.layers = mockDoc.layers.filter((l) => l !== layer);
    }),
  };
  return layer;
}

jest.mock(
  "photoshop",
  () => ({
    app: {
      get activeDocument() {
        return mockDoc;
      },
      documents: {
        add: jest.fn(async (opts) => {
          mockDoc = {
            id: 1,
            opts,
            resolution: opts.resolution,
            layers: [],
            activeLayers: [],
            closeWithoutSaving: jest.fn(async () => {}),
          };
          const blank = mockMakeLayer("Layer 1", { left: 0, top: 0, right: 0, bottom: 0 });
          mockDoc.layers.push(blank);
          mockDoc.activeLayers = [blank];
          return mockDoc;
        }),
      },
    },
    core: {
      executeAsModal: async (fn) => {
        const ctx = {
          get isCancelled() {
            return mockPlaced.length >= mockCancelAfter;
          },
          reportProgress: () => {},
          hostControl: {
            suspendHistory: async () => 42,
            resumeHistory: async (id, commit) => mockHistory.push(commit),
          },
        };
        return fn(ctx);
      },
    },
    constants: {
      NewDocumentMode: { RGB: "RGB" },
      DocumentFill: { TRANSPARENT: "transparent" },
      AnchorPosition: { TOPLEFT: "topLeft" },
      RasterizeType: { ENTIRELAYER: "entire" },
    },
    // Placing page N: Photoshop centers it and (here) shrinks it by half.
    action: {
      batchPlay: jest.fn(async ([desc]) => {
        const n = desc.as.pageNumber;
        const layer = mockMakeLayer("mockPlaced", { left: 10, top: 20, right: 10 + 1240, bottom: 20 + 1754 });
        mockPlaced.push(n);
        mockDoc.layers.unshift(layer);
        mockDoc.activeLayers = [layer];
      }),
    },
  }),
  { virtual: true }
);

jest.mock(
  "uxp",
  () => ({ storage: { localFileSystem: { createSessionToken: () => "token" } } }),
  { virtual: true }
);

const { importPages, CancelledError } = require("../src/importer");

// A4 in points; at 300 ppi that is 2480 x 3508 px.
const A4 = { width: 595.2756, height: 841.8898 };
const info = { pageCount: 4, sizes: [A4, A4, A4, A4] };
const file = { name: "doc.pdf" };

beforeEach(() => {
  mockPlaced.length = 0;
  mockHistory.length = 0;
  mockCancelAfter = Infinity;
  mockDoc = undefined;
});

test("new document: places pages last-to-first so page 1 is on top", async () => {
  const count = await importPages({ file, info, pages: [1, 2, 4], mode: "raster", target: "new" });

  expect(count).toBe(3);
  expect(mockPlaced).toEqual([4, 2, 1]);
  expect(mockDoc.opts).toMatchObject({ name: "doc", width: 2480, height: 3508, resolution: 300 });
  expect(mockDoc.layers.map((l) => l.name)).toEqual(["Page 1", "Page 2", "Page 4"]);
  expect(mockHistory).toEqual([true]);

  for (const layer of mockDoc.layers) {
    expect(layer.rasterized).toBe(true);
    expect(layer.boundsNoEffects).toEqual({ left: 0, top: 0, right: 2480, bottom: 3508 });
  }
});

test("smart object mode does not rasterize", async () => {
  await importPages({ file, info, pages: [3], mode: "smart", target: "new" });
  expect(mockDoc.layers).toHaveLength(1);
  expect(mockDoc.layers[0].rasterized).toBe(false);
});

test("cancellation rolls back mockHistory and closes the new document", async () => {
  mockCancelAfter = 1;
  await expect(
    importPages({ file, info, pages: [1, 2, 3], mode: "raster", target: "new" })
  ).rejects.toBeInstanceOf(CancelledError);
  expect(mockHistory).toEqual([false]);
  expect(mockDoc.closeWithoutSaving).toHaveBeenCalled();
});

test("current document target requires an open document", async () => {
  await expect(
    importPages({ file, info, pages: [1], mode: "raster", target: "current" })
  ).rejects.toThrow(/Нет открытого документа/);
});
