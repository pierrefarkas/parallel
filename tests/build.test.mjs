import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testRoot, "..");
const distRoot = path.join(projectRoot, "dist");

test("the built site contains its pinned browser runtime", async () => {
  const runtimeFiles = [
    "vendor/pdfjs/pdf.js",
    "vendor/pdfjs/pdf.worker.js",
    "vendor/tesseract/tesseract.esm.min.js",
    "vendor/tesseract/worker.min.js",
    "vendor/tesseract/lang/eng.traineddata.gz",
    "vendor/pdf-lib/pdf-lib.esm.min.js",
  ];
  await Promise.all(runtimeFiles.map((file) => access(path.join(distRoot, file))));
});

test("the application has no runtime dependency on another origin", async () => {
  const app = await readFile(path.join(distRoot, "app.js"), "utf8");
  const index = await readFile(path.join(distRoot, "index.html"), "utf8");
  assert.doesNotMatch(app, /https?:\/\//i);
  assert.match(index, /Content-Security-Policy/);
  assert.match(index, /default-src 'self'/);
  assert.doesNotMatch(index, /<script[^>]+https?:\/\//i);
  assert.match(app, /tesseract\.default\?\.createWorker \?\? tesseract\.createWorker/);
});

test("the deployable fixture directory contains only synthetic sample assets", async () => {
  const sampleFiles = (await readdir(path.join(distRoot, "sample"))).sort();
  assert.deepEqual(sampleFiles, ["parallel-sample.pdf", "parallel-sample.png"]);
  await assert.rejects(
    access(path.join(distRoot, "content")),
    (error) => error?.code === "ENOENT",
  );
});
