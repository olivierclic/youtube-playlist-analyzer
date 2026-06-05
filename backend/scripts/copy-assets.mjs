// Copie les assets non-TS (ex. schema.sql) de src/ vers dist/ après le build tsc.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const assets = ["db/schema.sql"];

for (const rel of assets) {
  const from = resolve(root, "src", rel);
  const to = resolve(root, "dist", rel);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`copied ${rel} -> dist/${rel}`);
}
