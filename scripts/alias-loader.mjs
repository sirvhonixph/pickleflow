import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

function resolveAlias(specifier) {
  let filePath = path.join(process.cwd(), specifier.slice(2));
  if (!path.extname(filePath)) {
    if (fs.existsSync(filePath + ".js")) filePath += ".js";
    else if (fs.existsSync(filePath + ".jsx")) filePath += ".jsx";
  }
  return pathToFileURL(filePath).href;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return { shortCircuit: true, url: resolveAlias(specifier) };
  }
  return nextResolve(specifier, context);
}
