// Lets a node harness import the game's own `.ts` sources by their
// extensionless specifiers, the way the bundler does.
//
// Node strips the types itself (`--experimental-strip-types`); what it will not
// do is guess that `../world/surface` means `../world/surface.ts`. This hook is
// the whole difference between a harness that measures the real file and one
// that measures a copy of it that has drifted.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && path.extname(specifier) === "" && context.parentURL) {
    const base = path.dirname(fileURLToPath(context.parentURL));
    const candidate = path.resolve(base, `${specifier}.ts`);
    if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
  }
  return nextResolve(specifier, context);
}
