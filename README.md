# Parallel

Parallel turns a page from a scanned English PDF into an editable English-French reading sheet without uploading the document. PDF rendering, English OCR, optional browser-provided translation, editing, and export run in the browser.

The live application is published with GitHub Pages. This public repository is a generated deployment mirror; the private Alpha2 repository is authoritative.

## Local verification

Requires Node.js 22 or later.

```bash
npm ci --no-fund --no-audit
npm run verify
```

The automated suite covers conversion helpers, safe HTML generation, two-column PDF generation and pagination, an image-only PDF fixture, real Tesseract OCR, runtime packaging, same-origin dependency policy, and private-source exclusion.

## Privacy and limitations

- Selected PDFs remain local to the browser and are never intentionally uploaded by this application.
- The bundled sample is synthetic and contains no private source material.
- OCR and machine translation can be wrong; both columns remain editable and require review.
- On-device English-to-French translation is optional and depends on the browser's experimental Translator API. Manual French entry works without it.
- The application has no accounts, database, analytics, payments, or server-side document storage.
