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
  $("targetCurrent").disabled = !canTargetCurrent;
  if (!canTargetCurrent && $("targetCurrent").checked) {
    $("targetCurrent").checked = false;
    $("targetGroup").querySelector('sp-radio[value="new"]').checked = true;
  }
  $("pickBtn").disabled = state.busy;
  $("pagesInput").disabled = state.busy || !state.info;
  $("importBtn").disabled = state.busy || !state.info || !pagesOk;
}

async function pickFile() {
  const file = await storage.localFileSystem.getFileForOpening({ types: ["pdf"] });
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

function init() {
  $("pickBtn").addEventListener("click", () => pickFile().catch((e) => setStatus(e.message, true)));
  $("importBtn").addEventListener("click", runImport);
  $("pagesInput").addEventListener("input", refreshUi);

  // Keep the "current document" option in sync with open documents.
  action
    .addNotificationListener(["open", "close", "make", "select"], () => refreshUi())
    .catch(() => {});

  refreshUi();
}

entrypoints.setup({
  panels: {
    pdfToLayersPanel: {
      show() {
        refreshUi();
      },
    },
  },
});

init();
