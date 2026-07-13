const A4 = [595.28, 841.89];
const WIN_ANSI_REPLACEMENTS = new Map([
  ["\u00a0", " "],
  ["\u202f", " "],
  ["\u2010", "-"],
  ["\u2011", "-"],
  ["\u2212", "-"],
]);

export function normalizePdfText(value) {
  return [...String(value ?? "")]
    .map((character) => WIN_ANSI_REPLACEMENTS.get(character) ?? character)
    .join("")
    .replace(/\r\n?/g, "\n");
}

export function wrapPdfText(value, font, size, maxWidth) {
  const lines = [];
  for (const sourceLine of normalizePdfText(value).split("\n")) {
    const words = sourceLine.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }

      if (line) {
        lines.push(line);
        line = "";
      }

      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        line = word;
        continue;
      }

      let segment = "";
      for (const character of word) {
        const next = `${segment}${character}`;
        if (segment && font.widthOfTextAtSize(next, size) > maxWidth) {
          lines.push(segment);
          segment = character;
        } else {
          segment = next;
        }
      }
      line = segment;
    }

    if (line) {
      lines.push(line);
    }
  }
  return lines;
}

export async function createBilingualPdf({ pdfLib, title, sourceName, pageNumber, rows }) {
  if (!pdfLib?.PDFDocument || !pdfLib?.StandardFonts || !pdfLib?.rgb) {
    throw new Error("A compatible PDF library is required.");
  }
  if (!Array.isArray(rows) || !rows.length || rows.some((row) => !row.english?.trim() || !row.french?.trim())) {
    throw new Error("Every paragraph pair must contain English and French text before PDF export.");
  }

  const { PDFDocument, StandardFonts, rgb } = pdfLib;
  const document = await PDFDocument.create();
  const bodyFont = await document.embedFont(StandardFonts.TimesRoman);
  const bodyItalic = await document.embedFont(StandardFonts.TimesRomanItalic);
  const uiFont = await document.embedFont(StandardFonts.Helvetica);
  const uiBold = await document.embedFont(StandardFonts.HelveticaBold);
  const paper = rgb(0.969, 0.953, 0.918);
  const ink = rgb(0.098, 0.137, 0.125);
  const muted = rgb(0.39, 0.44, 0.42);
  const line = rgb(0.82, 0.79, 0.73);
  const accent = rgb(0.72, 0.26, 0.15);
  const margin = 42;
  const rowNumberWidth = 22;
  const columnGap = 20;
  const bodySize = 10.4;
  const lineHeight = 15;
  const bottomLimit = 55;
  const [pageWidth, pageHeight] = A4;
  const columnWidth = (pageWidth - (margin * 2) - rowNumberWidth - columnGap) / 2;
  const leftX = margin + rowNumberWidth;
  const rightX = leftX + columnWidth + columnGap;
  const safeTitle = normalizePdfText(title || "Bilingual reading").slice(0, 110);
  const safeSource = normalizePdfText(sourceName || "Local source PDF").slice(0, 90);
  const sourcePage = Number.isInteger(Number(pageNumber)) ? Number(pageNumber) : 1;

  document.setTitle(safeTitle);
  document.setSubject("Private English-French parallel reading copy");
  document.setCreator("Alpha2 Parallel");
  document.setProducer("Alpha2 Parallel with pdf-lib");

  function addPage() {
    const page = document.addPage(A4);
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: paper });
    page.drawRectangle({ x: margin, y: pageHeight - 60, width: 18, height: 18, color: accent });
    page.drawText("PARALLEL", { x: margin + 28, y: pageHeight - 56, size: 8.5, font: uiBold, color: ink });
    page.drawText(safeTitle, { x: margin, y: pageHeight - 101, size: 23, font: bodyFont, color: ink, maxWidth: pageWidth - (margin * 2) });
    page.drawText(`Personal conversion - ${safeSource} - source page ${sourcePage}`, {
      x: margin,
      y: pageHeight - 121,
      size: 7.5,
      font: uiFont,
      color: muted,
      maxWidth: pageWidth - (margin * 2),
    });
    page.drawLine({ start: { x: margin, y: pageHeight - 137 }, end: { x: pageWidth - margin, y: pageHeight - 137 }, thickness: 0.7, color: line });
    page.drawText("ENGLISH", { x: leftX, y: pageHeight - 157, size: 7.3, font: uiBold, color: accent });
    page.drawText("FRANCAIS", { x: rightX, y: pageHeight - 157, size: 7.3, font: uiBold, color: accent });
    return { page, y: pageHeight - 178 };
  }

  let current = addPage();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const englishLines = wrapPdfText(rows[rowIndex].english, bodyFont, bodySize, columnWidth);
    const frenchLines = wrapPdfText(rows[rowIndex].french, bodyFont, bodySize, columnWidth);
    let englishIndex = 0;
    let frenchIndex = 0;
    let continuation = false;

    while (englishIndex < englishLines.length || frenchIndex < frenchLines.length) {
      const remainingHeight = current.y - bottomLimit;
      const availableLines = Math.floor((remainingHeight - 18) / lineHeight);
      if (availableLines < 2) {
        current = addPage();
        continuation = true;
        continue;
      }

      const englishSlice = englishLines.slice(englishIndex, englishIndex + availableLines);
      const frenchSlice = frenchLines.slice(frenchIndex, frenchIndex + availableLines);
      const usedLines = Math.max(englishSlice.length, frenchSlice.length, 1);
      const numberLabel = `${String(rowIndex + 1).padStart(2, "0")}${continuation ? " cont." : ""}`;
      current.page.drawText(numberLabel, { x: margin, y: current.y - 1, size: 6.7, font: uiBold, color: muted });

      englishSlice.forEach((text, lineIndex) => {
        current.page.drawText(text, { x: leftX, y: current.y - (lineIndex * lineHeight), size: bodySize, font: bodyFont, color: ink });
      });
      frenchSlice.forEach((text, lineIndex) => {
        current.page.drawText(text, { x: rightX, y: current.y - (lineIndex * lineHeight), size: bodySize, font: bodyFont, color: ink });
      });

      englishIndex += englishSlice.length;
      frenchIndex += frenchSlice.length;
      current.y -= (usedLines * lineHeight) + 14;
      current.page.drawLine({ start: { x: margin, y: current.y + 5 }, end: { x: pageWidth - margin, y: current.y + 5 }, thickness: 0.45, color: line });
      continuation = englishIndex < englishLines.length || frenchIndex < frenchLines.length;
      if (continuation) {
        current = addPage();
      }
    }
  }

  const pages = document.getPages();
  pages.forEach((page, index) => {
    page.drawText("Machine-assisted text requires review.", { x: margin, y: 28, size: 7, font: bodyItalic, color: muted });
    const pageLabel = `${index + 1} / ${pages.length}`;
    const pageLabelWidth = uiFont.widthOfTextAtSize(pageLabel, 7);
    page.drawText(pageLabel, { x: pageWidth - margin - pageLabelWidth, y: 28, size: 7, font: uiFont, color: muted });
  });

  return document.save();
}
