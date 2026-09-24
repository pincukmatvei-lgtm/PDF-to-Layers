const { app, action } = require("photoshop");
const { storage, entrypoints } = require("uxp");
const { getPdfInfo } = require("./pdfInfo");
const { parsePageRange } = require("./pageRange");
const { importPages, CancelledError } = require("./importer");

const $ = (id) => document.getElementById(id);

const state = {
  file: null,
  info: null,
  busy: false,
};

function selectedValue(groupId) {
  const checked = [...$(groupId).querySelectorAll("sp-radio")].find((r) => r.checked);
  return checked ? checked.getAttribute("value") : null;
}

function setStatus(text, isError = false) {
  const el = $("status");
  el.textContent = text;
  el.classList.toggle("error", isError);
}

/** UXP Spectrum widgets react to the attribute, not reliably to the property. */
function setEnabled(id, enabled) {
  const el = $(id);
  if (enabled) el.removeAttribute("disabled");
  else el.setAttribute("disabled", "");
}

function hasOpenDocument() {
  return app.documents.length > 0;
}

/** Validates the page field; returns the page list or null. */
function validatePages() {
  if (!state.info) return null;
  try {
    const pages = parsePageRange($("pagesInput").value, state.info.pageCount);
    $("pagesError").textContent = "";
    return pages;
  } catch (e) {
    $("pagesError").textContent = e.message;
    return null;
  }
}

function refreshUi() {
  const pagesOk = validatePages() !== null;
  const canTargetCurrent = hasOpenDocument();
  setEnabled("targetCurrent", canTargetCurrent);
  if (!canTargetCurrent && $("targetCurrent").checked) {
    $("targetCurrent").checked = false;
    $("targetGroup").querySelector('sp-radio[value="new"]').checked = true;
  }
  setEnabled("pickBtn", !state.busy);
  setEnabled("pagesInput", !state.busy && !!state.info);
  setEnabled("importBtn", !state.busy && !!state.info && pagesOk);
}

async function pickFile() {
  if (state.busy) return;
  const picked = await storage.localFileSystem.getFileForOpening({
    allowMultiple: false,
    types: ["pdf"],
  });
  // Some UXP versions return an array even for a single file.
  const file = Array.isArray(picked) ? picked[0] : picked;
  if (!file) return;

  state.file = null;
  state.info = null;
  $("fileName").textContent = file.name;
  setStatus("Чтение PDF…");
  refreshUi();

  try {
    const bytes = await file.read({ format: storage.formats.binary });
    state.info = await getPdfInfo(bytes);
    state.file = file;
    $("fileName").textContent = `${file.name} — ${state.info.pageCount} стр.`;
    setStatus("");
  } catch (e) {
    $("fileName").textContent = "Файл не выбран";
    setStatus(e.message, true);
  }
  refreshUi();
}

async function runImport() {
  const pages = validatePages();
  if (!pages || !state.file) return;

  state.busy = true;
  refreshUi();
  try {
    const count = await importPages({
      file: state.file,
      info: state.info,
      pages,
      mode: selectedValue("modeGroup"),
      target: selectedValue("targetGroup"),
      onStatus: (msg) => setStatus(msg),
    });
    setStatus(`Готово: импортировано слоёв — ${count}`);
  } catch (e) {
    if (e instanceof CancelledError || /cancel/i.test(e.message)) {
      setStatus("Импорт отменён");
    } else {
      console.error(e);
      setStatus(`Ошибка: ${e.message}`, true);
    }
  } finally {
    state.busy = false;
    refreshUi();
  }
}

/** Runs a UI handler and shows any failure in the panel instead of swallowing it. */
function guarded(fn) {
  return () => {
    Promise.resolve()
      .then(fn)
      .catch((e) => {
        console.error(e);
        setStatus(`Ошибка: ${e && e.message ? e.message : e}`, true);
      });
  };
}

function init() {
  setStatus("");
  $("pickBtn").addEventListener("click", guarded(pickFile));
  $("importBtn").addEventListener("click", guarded(runImport));
  $("pagesInput").addEventListener("input", guarded(refreshUi));

  // Keep the "current document" option in sync with open documents.
  // Optional: the panel works without it.
  try {
    const result = action.addNotificationListener(["open", "close", "make", "select"], () => {
      try {
        refreshUi();
      } catch (e) {
        console.error(e);
      }
    });
    if (result && typeof result.catch === "function") result.catch((e) => console.error(e));
  } catch (e) {
    console.error(e);
  }

  refreshUi();
}

// Wire up the UI first so a failure below can never leave dead buttons.
try {
  init();
} catch (e) {
  console.error(e);
  setStatus(`Ошибка инициализации: ${e.message}`, true);
}

try {
  entrypoints.setup({
    panels: {
      pdfToLayersPanel: {
        show() {
          try {
            refreshUi();
          } catch (e) {
            console.error(e);
          }
        },
      },
    },
  });
} catch (e) {
  console.error(e);
}
