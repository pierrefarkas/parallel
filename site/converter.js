const SENTENCE_END = /[.!?]["')\]]?$/;

export function normalizeOcrText(value) {
  const normalized = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])-[ \t]*\n[ \t]*([a-zà-öø-ÿ])/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized;
}

export function splitIntoParagraphs(value) {
  const normalized = normalizeOcrText(value);
  if (!normalized) {
    return [];
  }

  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim())
    .filter(Boolean);

  if (blocks.length > 1) {
    return blocks;
  }

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const paragraphs = [];
  let current = "";

  for (const line of lines) {
    const looksLikeHeading = line.length < 80 && line === line.toUpperCase() && /[A-Z]/.test(line);
    if (looksLikeHeading && current) {
      paragraphs.push(current);
      current = "";
    }

    current = current ? `${current} ${line}` : line;

    if (looksLikeHeading || (SENTENCE_END.test(line) && current.length > 420)) {
      paragraphs.push(current);
      current = "";
    }
  }

  if (current) {
    paragraphs.push(current);
  }

  return paragraphs;
}

export function rowsAreComplete(rows) {
  return rows.length > 0 && rows.every(({ english, french }) => english.trim() && french.trim());
}

export function safeFileStem(value) {
  const stem = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return stem || "bilingual-reading";
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphMarkup(value, language) {
  return `<p lang="${language}">${escapeHtml(value).replace(/\n/g, "<br>")}</p>`;
}

export function createBilingualHtml({ title, sourceName, pageNumber, rows }) {
  if (!rowsAreComplete(rows)) {
    throw new Error("Every paragraph pair must contain English and French text before export.");
  }

  const safeTitle = escapeHtml(title || "Bilingual reading page");
  const safeSource = escapeHtml(sourceName || "Local source PDF");
  const safePage = Number.isInteger(Number(pageNumber)) ? Number(pageNumber) : 1;
  const content = rows.map((row, index) => `
      <section class="pair" aria-labelledby="pair-${index + 1}">
        <h2 id="pair-${index + 1}">${String(index + 1).padStart(2, "0")}</h2>
        <div>${paragraphMarkup(row.english, "en")}</div>
        <div>${paragraphMarkup(row.french, "fr")}</div>
      </section>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'">
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: light; --ink:#1b211f; --muted:#66706d; --paper:#f4f1e8; --line:#d8d3c7; --accent:#a33c25; }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--ink); background:var(--paper); font-family:Georgia,"Times New Roman",serif; line-height:1.58; }
    header,main,footer { width:min(calc(100% - 2rem),72rem); margin-inline:auto; }
    header { padding:3rem 0 2rem; border-bottom:1px solid var(--line); }
    h1 { max-width:52rem; margin:0; font-size:clamp(2.5rem,7vw,5rem); font-weight:500; letter-spacing:-.045em; line-height:.95; }
    .meta,footer { color:var(--muted); font-family:Arial,sans-serif; font-size:.82rem; }
    .meta { margin:1rem 0 0; }
    .legend,.pair { display:grid; grid-template-columns:2.5rem minmax(0,1fr) minmax(0,1fr); gap:1.25rem; }
    .legend { padding:1.2rem 0 .6rem; color:var(--accent); font-family:Arial,sans-serif; font-size:.7rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
    .legend span:first-child { grid-column:2; }
    .pair { break-inside:avoid; padding:1.4rem 0; border-top:1px solid var(--line); }
    .pair h2 { margin:.25rem 0 0; color:var(--muted); font-family:Arial,sans-serif; font-size:.7rem; }
    .pair p { margin:0; }
    footer { padding:2rem 0 3rem; border-top:1px solid var(--line); }
    @media (max-width:42rem) { .legend { display:none; } .pair { grid-template-columns:2rem 1fr; } .pair div:last-child { grid-column:2; padding-top:1rem; border-top:1px dotted var(--line); } }
    @media print { @page { size:A4; margin:16mm; } body { background:white; } header,main,footer { width:auto; } header { padding-top:0; } }
  </style>
</head>
<body>
  <header>
    <h1>${safeTitle}</h1>
    <p class="meta">Personal conversion - ${safeSource} - source page ${safePage}</p>
  </header>
  <main>
    <div class="legend" aria-hidden="true"><span>English</span><span>Français</span></div>${content}
  </main>
  <footer>Generated locally with Alpha2 Parallel. Machine-assisted text should be reviewed against the source.</footer>
</body>
</html>`;
}
