import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker } from "tesseract.js";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testRoot, "..");
const samplePdfPath = path.join(projectRoot, "site", "sample", "parallel-sample.pdf");
const samplePngPath = path.join(projectRoot, "site", "sample", "parallel-sample.png");
const standardFontDataUrl = `${path.join(
  projectRoot,
  "node_modules",
  "pdfjs-dist",
  "standard_fonts",
).replaceAll("\\", "/")}/`;
const languagePath = path.join(
  projectRoot,
  "node_modules",
  "@tesseract.js-data",
  "eng",
  "4.0.0_best_int",
);

test("the safe sample is a one-page image-only PDF", async () => {
  const data = new Uint8Array(await readFile(samplePdfPath));
  const pdf = await getDocument({ data, disableWorker: true, standardFontDataUrl }).promise;
  assert.equal(pdf.numPages, 1);

  const page = await pdf.getPage(1);
  const text = await page.getTextContent();
  assert.equal(text.items.length, 0, "fixture must exercise OCR rather than a PDF text layer");
  await pdf.destroy();
});

test("local OCR recognizes the synthetic scanned page", async () => {
  const worker = await createWorker("eng", undefined, {
    langPath: languagePath,
    gzip: true,
    cacheMethod: "none",
  });

  try {
    const result = await worker.recognize(samplePngPath);
    const recognized = result.data.text.replace(/\s+/g, " ").toUpperCase();
    assert.match(recognized, /PARALLEL SAMPLE/);
    assert.match(recognized, /PRIVATE DOCUMENT STAYS ON YOUR DEVICE/);
  } finally {
    await worker.terminate();
  }
});
