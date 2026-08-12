import { mkdirSync, writeFileSync } from "node:fs";

const version = new Date().toISOString();

mkdirSync("public", { recursive: true });
writeFileSync(
  "public/version.json",
  `${JSON.stringify({ version }, null, 2)}\n`,
  "utf8",
);
