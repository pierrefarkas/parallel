import {
  createBilingualHtml,
  rowsAreComplete,
  safeFileStem,
  splitIntoParagraphs,
} from "./converter.js";
import { createBilingualPdf } from "./pdf-export.js";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_PAGES = 2000;
const MAX_CANVAS_PIXELS = 16_000_000;
const runtimeUrl = (path) => new URL(path, import.meta.url).href;

const dependencies = {
  pdfjsLib: null,
  createWorker: null,
  pdfLib: null,
  promise: null,
};

function loadDocumentDependencies() {
  if (!dependencies.promise) {
    dependencies.promise = Promise.all([
      import("./vendor/pdfjs/pdf.js"),
      import("./vendor/tesseract/tesseract.esm.min.js"),
      import("./vendor/pdf-lib/pdf-lib.esm.min.js"),
    ]).then(([pdfjsLib, tesseract, pdfLib]) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = runtimeUrl("./vendor/pdfjs/pdf.worker.js");
      dependencies.pdfjsLib = pdfjsLib;
      dependencies.createWorker = tesseract.default?.createWorker ?? tesseract.createWorker;
      if (typeof dependencies.createWorker !== "function") {
        throw new Error("The local OCR runtime does not expose a compatible worker API.");
      }
      dependencies.pdfLib = pdfLib;
      return dependencies;
    }).catch((error) => {
      dependencies.promise = null;
      throw error;
    });
  }

  return dependencies.promise;
}

const elements = {
  file: document.querySelector("#pdf-file"),
  filePrompt: document.querySelector("#file-prompt"),
  fileDetail: document.querySelector("#file-detail"),
  trySample: document.querySelector("#try-sample"),
  pageNumber: document.querySelector("#page-number"),
  processPage: document.querySelector("#process-page"),
  canvas: document.querySelector("#source-canvas"),
  previewCaption: document.querySelector("#preview-caption"),
  statusTitle: document.querySelector("#status-title"),
  statusDetail: document.querySelector("#status-detail"),
  emptyTranslation: document.querySelector("#empty-translation"),
  rows: document.querySelector("#translation-rows"),
  addRow: document.querySelector("#add-row"),
  translateRows: document.querySelector("#translate-rows"),
  completionMessage: document.querySelector("#completion-message"),
  documentTitle: document.querySelector("#document-title"),
  downloadHtml: document.querySelector("#download-html"),
  downloadPdf: document.querySelector("#download-pdf"),
};

const state = {
  file: null,
  pdf: null,
  ocrWorker: null,
  translator: null,
  htmlUrl: null,
  pdfUrl: null,
  exportTimer: null,
  exportGeneration: 0,
};

function setStatus(kind, title, detail) {
  document.body.dataset.appStatus = kind;
  elements.statusTitle.textContent = title;
  elements.statusDetail.textContent = detail;
}

function setBusy(isBusy) {
  elements.file.disabled = isBusy;
  elements.trySample.disabled = isBusy;
  elements.pageNumber.disabled = isBusy || !state.pdf;
  elements.processPage.disabled = isBusy || !state.pdf;
}

function setDownloadState(element, { url = null, filename = null, label, busy = false }) {
  element.textContent = label;
  element.setAttribute("aria-busy", String(busy));
  if (url && filename) {
    element.href = url;
    element.download = filename;
    element.setAttribute("aria-disabled", "false");
  } else {
    element.removeAttribute("href");
    element.removeAttribute("download");
    element.setAttribute("aria-disabled", "true");
  }
}

function revokeUrl(key) {
  if (state[key]) {
    URL.revokeObjectURL(state[key]);
    state[key] = null;
  }
}

function currentRows() {
  return [...elements.rows.querySelectorAll(".translation-row")].map((row) => ({
    english: row.querySelector('[data-language="english"]').value,
    french: row.querySelector('[data-language="french"]').value,
  }));
}

function updateTranslationAction() {
  const translatorAvailable = "Translator" in globalThis;
  const rows = currentRows();
  elements.translateRows.hidden = !translatorAvailable;
  elements.translateRows.disabled = !translatorAvailable
    || !rows.length
    || rows.some((row) => !row.english.trim());
}

function exportDetails(rows = currentRows()) {
  return {
    title: elements.documentTitle.value.trim() || "Bilingual reading page",
    sourceName: state.file?.name,
    pageNumber: Number(elements.pageNumber.value),
    rows,
  };
}

async function preparePdfDownload(rows, generation) {
  try {
    await loadDocumentDependencies();
    const bytes = await createBilingualPdf({ pdfLib: dependencies.pdfLib, ...exportDetails(rows) });
    if (generation !== state.exportGeneration) {
      return;
    }

    revokeUrl("pdfUrl");
    state.pdfUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    setDownloadState(elements.downloadPdf, {
      url: state.pdfUrl,
      filename: `${safeFileStem(elements.documentTitle.value)}-page-${elements.pageNumber.value}.pdf`,
      label: "Download PDF",
    });
    document.body.dataset.exportStatus = "ready";
    elements.completionMessage.textContent = `${rows.length} paragraph pair${rows.length === 1 ? "" : "s"} ready in HTML and PDF.`;
    setStatus("success", "Bilingual copy ready", "Both columns are complete. Review the text, then download HTML or PDF.");
  } catch (error) {
    if (generation !== state.exportGeneration) {
      return;
    }
    document.body.dataset.exportStatus = "error";
    setDownloadState(elements.downloadPdf, { label: "PDF unavailable" });
    setStatus("error", "PDF export stopped", error instanceof Error ? error.message : String(error));
  }
}

function updateExportState() {
  const rows = currentRows();
  const complete = rowsAreComplete(rows);
  state.exportGeneration += 1;
  const generation = state.exportGeneration;
  clearTimeout(state.exportTimer);
  revokeUrl("htmlUrl");
  revokeUrl("pdfUrl");
  updateTranslationAction();

  if (!complete) {
    document.body.dataset.exportStatus = "incomplete";
    setDownloadState(elements.downloadHtml, { label: "Download HTML" });
    setDownloadState(elements.downloadPdf, { label: "Download PDF" });
    elements.completionMessage.textContent = rows.length
      ? "Complete both columns to unlock export."
      : "Convert a page or add a paragraph pair manually.";
    return;
  }

  const html = createBilingualHtml(exportDetails(rows));
  state.htmlUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  setDownloadState(elements.downloadHtml, {
    url: state.htmlUrl,
    filename: `${safeFileStem(elements.documentTitle.value)}-page-${elements.pageNumber.value}.html`,
    label: "Download HTML",
  });
  setDownloadState(elements.downloadPdf, { label: "Preparing PDF...", busy: true });
  document.body.dataset.exportStatus = "preparing";
  elements.completionMessage.textContent = "HTML ready. Preparing the two-column PDF...";
  state.exportTimer = setTimeout(() => preparePdfDownload(rows, generation), 180);
}

function resizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 144), 420)}px`;
}

function createRow(english = "", french = "") {
  const item = document.createElement("li");
  item.className = "translation-row";
  const index = elements.rows.children.length + 1;

  const englishLabel = document.createElement("label");
  const englishLabelText = document.createElement("span");
  englishLabelText.textContent = `English paragraph ${index}`;
  const englishArea = document.createElement("textarea");
  englishArea.dataset.language = "english";
  englishArea.value = english;
  englishArea.spellcheck = true;
  englishArea.lang = "en";
  englishLabel.append(englishLabelText, englishArea);

  const frenchLabel = document.createElement("label");
  const frenchLabelText = document.createElement("span");
  frenchLabelText.textContent = `French paragraph ${index}`;
  const frenchArea = document.createElement("textarea");
  frenchArea.dataset.language = "french";
  frenchArea.value = french;
  frenchArea.spellcheck = true;
  frenchArea.lang = "fr";
  frenchLabel.append(frenchLabelText, frenchArea);

  item.append(englishLabel, frenchLabel);
  elements.rows.append(item);
  elements.emptyTranslation.hidden = true;
  item.addEventListener("input", (event) => {
    if (event.target instanceof HTMLTextAreaElement) {
      resizeTextarea(event.target);
    }
    updateExportState();
  });
  resizeTextarea(englishArea);
  resizeTextarea(frenchArea);
  updateExportState();
  return item;
}

function clearRows() {
  elements.rows.replaceChildren();
  elements.emptyTranslation.hidden = false;
  updateExportState();
}

async function validatePdfFile(file) {
  if (!(file instanceof File)) {
    throw new Error("Choose a PDF file to continue.");
  }
  if (!file.size) {
    throw new Error("The selected file is empty.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("The selected PDF is larger than the 50 MB safety limit.");
  }
  if (file.type && file.type !== "application/pdf") {
    throw new Error("The selected file is not identified as a PDF.");
  }
  const signature = new TextDecoder("ascii").decode(await file.slice(0, 5).arrayBuffer());
  if (signature !== "%PDF-") {
    throw new Error("The selected file does not contain a valid PDF signature.");
  }
}

async function loadPdf(file) {
  setBusy(true);
  document.body.dataset.documentStatus = "loading";
  setStatus("working", "Opening the PDF", "Validating and reading the document locally...");
  clearRows();

  try {
    await validatePdfFile(file);
    await loadDocumentDependencies();
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await dependencies.pdfjsLib.getDocument({ data }).promise;
    if (!pdf.numPages || pdf.numPages > MAX_PAGES) {
      throw new Error(`The PDF must contain between 1 and ${MAX_PAGES} pages.`);
    }

    state.pdf = pdf;
    state.file = file;
    elements.pageNumber.max = pdf.numPages;
    elements.pageNumber.value = "1";
    elements.filePrompt.textContent = file.name;
    elements.fileDetail.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"} - ${(file.size / 1024 / 1024).toFixed(1)} MB - local only`;
    elements.documentTitle.value = file.name.replace(/\.pdf$/i, "").replace(/^_+/, "") || "Bilingual reading page";
    document.body.dataset.documentStatus = "ready";
    setStatus("success", "Document ready", `Choose a page from 1 to ${pdf.numPages}.`);
    return true;
  } catch (error) {
    state.pdf = null;
    state.file = null;
    document.body.dataset.documentStatus = "error";
    setStatus("error", "Could not open this PDF", error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    setBusy(false);
  }
}

async function renderPage(pageNumber) {
  const page = await state.pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  let scale = Math.max(2, 1800 / baseViewport.width);
  let viewport = page.getViewport({ scale });
  if ((viewport.width * viewport.height) > MAX_CANVAS_PIXELS) {
    scale *= Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height));
    viewport = page.getViewport({ scale });
  }

  const context = elements.canvas.getContext("2d", { alpha: false });
  elements.canvas.width = Math.floor(viewport.width);
  elements.canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  elements.canvas.classList.add("is-visible");
  elements.previewCaption.textContent = `${state.file.name} - page ${pageNumber}`;
}

async function recognizeEnglish() {
  if (!state.ocrWorker) {
    state.ocrWorker = await dependencies.createWorker("eng", undefined, {
      workerPath: runtimeUrl("./vendor/tesseract/worker.min.js"),
      langPath: runtimeUrl("./vendor/tesseract/lang").replace(/\/$/, ""),
      corePath: runtimeUrl("./vendor/tesseract/core").replace(/\/$/, ""),
      workerBlobURL: false,
      gzip: true,
      logger(message) {
        if (message.status === "recognizing text") {
          const percentage = Math.round((message.progress || 0) * 100);
          setStatus("working", "Reading the English page", `OCR ${percentage}% complete...`);
        }
      },
    });
  }

  const result = await state.ocrWorker.recognize(elements.canvas);
  return splitIntoParagraphs(result.data.text);
}

async function getTranslator() {
  if (!("Translator" in globalThis)) {
    return null;
  }
  if (state.translator) {
    return state.translator;
  }

  const options = { sourceLanguage: "en", targetLanguage: "fr" };
  state.translator = await globalThis.Translator.create({
    ...options,
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        setStatus("working", "Preparing private translation", `French language pack ${Math.round(event.loaded * 100)}% downloaded...`);
      });
    },
  });
  return state.translator;
}

async function translateRows(items) {
  let translator;
  try {
    translator = await getTranslator();
  } catch (error) {
    setStatus("success", "English OCR is ready", `On-device translation could not start. Enter French manually. ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }

  if (!translator) {
    setStatus("success", "English OCR is ready", "This browser has no on-device Translator API. Enter or paste French in the right column.");
    return false;
  }

  for (let index = 0; index < items.length; index += 1) {
    setStatus("working", "Translating on this device", `Paragraph ${index + 1} of ${items.length}...`);
    const frenchArea = items[index].querySelector('[data-language="french"]');
    const englishArea = items[index].querySelector('[data-language="english"]');
    frenchArea.value = await translator.translate(englishArea.value);
    resizeTextarea(frenchArea);
  }
  updateExportState();
  return true;
}

async function translateCurrentRows() {
  const items = [...elements.rows.querySelectorAll(".translation-row")];
  if (!items.length) {
    return;
  }

  elements.translateRows.disabled = true;
  try {
    const translated = await translateRows(items);
    if (translated) {
      setStatus("success", "Private translation ready to review", "Compare the French with the English and source scan, correct mistakes, then export.");
    }
  } finally {
    updateTranslationAction();
  }
}

async function processSelectedPage() {
  const pageNumber = Number(elements.pageNumber.value);
  if (!state.pdf || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > state.pdf.numPages) {
    setStatus("error", "Choose a valid page", `Enter a page number from 1 to ${state.pdf?.numPages ?? 1}.`);
    return false;
  }

  setBusy(true);
  clearRows();
  document.body.dataset.conversionStatus = "working";

  try {
    setStatus("working", "Rendering the selected page", `Preparing source page ${pageNumber}...`);
    await renderPage(pageNumber);
    setStatus("working", "Preparing English OCR", "Loading the local recognition model...");
    const paragraphs = await recognizeEnglish();
    if (!paragraphs.length) {
      throw new Error("No English text was detected on this page. Try a page with body text.");
    }

    paragraphs.forEach((paragraph) => createRow(paragraph));
    const nextStep = "Translator" in globalThis
      ? "Use on-device translation, or enter French manually."
      : "Enter or paste French in the right column.";
    setStatus("success", "English OCR is ready", nextStep);
    document.body.dataset.conversionStatus = "ready";
    document.querySelector("#translation-title").scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  } catch (error) {
    document.body.dataset.conversionStatus = "error";
    setStatus("error", "Page conversion stopped", error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    setBusy(false);
  }
}

async function loadSample() {
  setStatus("working", "Loading the safe sample", "Preparing a one-page synthetic scan...");
  try {
    const response = await fetch("./sample/parallel-sample.pdf", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Sample request failed with HTTP ${response.status}.`);
    }
    const file = new File([await response.blob()], "parallel-sample.pdf", { type: "application/pdf" });
    if (await loadPdf(file)) {
      await processSelectedPage();
    }
  } catch (error) {
    setStatus("error", "Sample conversion stopped", error instanceof Error ? error.message : String(error));
  }
}

elements.file.addEventListener("change", async () => {
  const [file] = elements.file.files;
  if (file) {
    await loadPdf(file);
  }
});
elements.trySample.addEventListener("click", loadSample);
elements.processPage.addEventListener("click", processSelectedPage);
elements.addRow.addEventListener("click", () => createRow());
elements.translateRows.addEventListener("click", translateCurrentRows);
elements.documentTitle.addEventListener("input", updateExportState);
document.body.dataset.appReady = "true";
document.body.dataset.exportStatus = "incomplete";
updateExportState();

loadDocumentDependencies()
  .then(() => {
    document.body.dataset.documentLibraries = "ready";
  })
  .catch((error) => {
    document.body.dataset.documentLibraries = "unavailable";
    setStatus("error", "Document tools are offline", `Manual editing and export still work. PDF and OCR loading will retry when you choose a file. ${error instanceof Error ? error.message : String(error)}`);
  });

window.addEventListener("beforeunload", () => {
  clearTimeout(state.exportTimer);
  revokeUrl("htmlUrl");
  revokeUrl("pdfUrl");
  state.ocrWorker?.terminate();
  state.translator?.destroy?.();
});
