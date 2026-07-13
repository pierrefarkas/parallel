import test from "node:test";
import assert from "node:assert/strict";
import {
  createBilingualHtml,
  escapeHtml,
  normalizeOcrText,
  rowsAreComplete,
  safeFileStem,
  splitIntoParagraphs,
} from "../site/converter.js";

test("normalizes scanner line endings and rejoins hyphenated words", () => {
  assert.equal(normalizeOcrText("A diffi-\r\ncult line.\r\n\r\nNext."), "A difficult line.\n\nNext.");
});

test("splits blank-line OCR blocks into aligned paragraph candidates", () => {
  assert.deepEqual(
    splitIntoParagraphs("FIRST MEETING\n\nThe first line\ncontinues here.\n\nA second paragraph."),
    ["FIRST MEETING", "The first line continues here.", "A second paragraph."],
  );
});

test("keeps a short heading separate when OCR omits blank lines", () => {
  assert.deepEqual(
    splitIntoParagraphs("FIRST MEETING\nThe opening paragraph begins here and continues."),
    ["FIRST MEETING", "The opening paragraph begins here and continues."],
  );
});

test("requires text in both languages before export", () => {
  assert.equal(rowsAreComplete([{ english: "Hello", french: "Bonjour" }]), true);
  assert.equal(rowsAreComplete([{ english: "Hello", french: "  " }]), false);
  assert.equal(rowsAreComplete([]), false);
});

test("creates safe stable download stems", () => {
  assert.equal(safeFileStem("École & Life: page 1"), "ecole-life-page-1");
  assert.equal(safeFileStem("---"), "bilingual-reading");
});

test("escapes generated HTML content", () => {
  assert.equal(escapeHtml(`<script>alert("x")</script>`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
});

test("exports two language columns with source context", () => {
  const html = createBilingualHtml({
    title: "First meeting",
    sourceName: "source.pdf",
    pageNumber: 20,
    rows: [{ english: "A difficult journey.", french: "Un voyage difficile." }],
  });

  assert.match(html, /grid-template-columns:2\.5rem minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(html, /<p lang="en">A difficult journey\.<\/p>/);
  assert.match(html, /<p lang="fr">Un voyage difficile\.<\/p>/);
  assert.match(html, /source\.pdf - source page 20/);
  assert.match(html, /Content-Security-Policy/);
});

test("refuses to export incomplete paragraph pairs", () => {
  assert.throws(
    () => createBilingualHtml({ title: "Draft", rows: [{ english: "Text", french: "" }] }),
    /Every paragraph pair/,
  );
});
