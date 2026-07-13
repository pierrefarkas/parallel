import test from "node:test";
import assert from "node:assert/strict";
import * as pdfLib from "pdf-lib";
import { createBilingualPdf, normalizePdfText, wrapPdfText } from "../site/pdf-export.js";

test("normalizes PDF-hostile spacing and dash characters", () => {
  assert.equal(normalizePdfText("one\u2011two\u202fthree"), "one-two three");
});

test("wraps text within the requested width", async () => {
  const document = await pdfLib.PDFDocument.create();
  const font = await document.embedFont(pdfLib.StandardFonts.TimesRoman);
  const lines = wrapPdfText("A bilingual sentence that must wrap cleanly.", font, 11, 110);
  assert.ok(lines.length > 1);
  assert.ok(lines.every((line) => font.widthOfTextAtSize(line, 11) <= 110));
});

test("creates a readable bilingual PDF", async () => {
  const bytes = await createBilingualPdf({
    pdfLib,
    title: "Parallel sample",
    sourceName: "synthetic-scan.pdf",
    pageNumber: 1,
    rows: [
      { english: "Your private document stays on your device.", french: "Votre document prive reste sur votre appareil." },
      { english: "Review every line before export.", french: "Relisez chaque ligne avant l'exportation." },
    ],
  });

  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("ascii"), "%PDF-");
  const document = await pdfLib.PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 1);
  assert.equal(document.getTitle(), "Parallel sample");
});

test("paginates long parallel text without failing", async () => {
  const longText = Array.from({ length: 180 }, (_, index) => `sentence ${index + 1}`).join(" ");
  const bytes = await createBilingualPdf({
    pdfLib,
    title: "Long sample",
    sourceName: "synthetic-scan.pdf",
    pageNumber: 1,
    rows: [{ english: longText, french: longText }],
  });
  const document = await pdfLib.PDFDocument.load(bytes);
  assert.ok(document.getPageCount() > 1);
});
