import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptRoot, "..");
const siteRoot = path.join(projectRoot, "site");
const distRoot = path.join(projectRoot, "dist");
const modulesRoot = path.join(projectRoot, "node_modules");
const includeTestAssets = process.argv.includes("--include-test-assets");

async function copyFile(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
}

async function copyMatching(sourceDirectory, destinationDirectory, matcher) {
  await mkdir(destinationDirectory, { recursive: true });
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  const selected = entries.filter((entry) => entry.isFile() && matcher(entry.name));
  if (!selected.length) {
    throw new Error(`No matching runtime assets found in ${sourceDirectory}`);
  }

  await Promise.all(selected.map((entry) => copyFile(
    path.join(sourceDirectory, entry.name),
    path.join(destinationDirectory, entry.name),
  )));
}

await rm(distRoot, { recursive: true, force: true });
await cp(siteRoot, distRoot, {
  recursive: true,
  filter(source) {
    return !source.includes(`${path.sep}vendor${path.sep}`);
  },
});

const vendorRoot = path.join(distRoot, "vendor");

await copyFile(
  path.join(modulesRoot, "pdfjs-dist", "build", "pdf.mjs"),
  path.join(vendorRoot, "pdfjs", "pdf.js"),
);
await copyFile(
  path.join(modulesRoot, "pdfjs-dist", "build", "pdf.worker.mjs"),
  path.join(vendorRoot, "pdfjs", "pdf.worker.js"),
);
await copyFile(
  path.join(modulesRoot, "tesseract.js", "dist", "tesseract.esm.min.js"),
  path.join(vendorRoot, "tesseract", "tesseract.esm.min.js"),
);
await copyFile(
  path.join(modulesRoot, "tesseract.js", "dist", "worker.min.js"),
  path.join(vendorRoot, "tesseract", "worker.min.js"),
);
await copyMatching(
  path.join(modulesRoot, "tesseract.js-core"),
  path.join(vendorRoot, "tesseract", "core"),
  (name) => /^tesseract-core.*\.(?:js|wasm)$/.test(name),
);
await copyFile(
  path.join(modulesRoot, "@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"),
  path.join(vendorRoot, "tesseract", "lang", "eng.traineddata.gz"),
);
await copyFile(
  path.join(modulesRoot, "pdf-lib", "dist", "pdf-lib.esm.min.js"),
  path.join(vendorRoot, "pdf-lib", "pdf-lib.esm.min.js"),
);

if (!includeTestAssets) {
  await rm(path.join(distRoot, "sample", "parallel-sample.png"), { force: true });
}

await writeFile(path.join(distRoot, ".nojekyll"), "", "utf8");
console.log(`Built Parallel at ${distRoot}${includeTestAssets ? " with test assets" : ""}.`);
