import path from "node:path";
import { fileURLToPath } from "node:url";

const API_PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function resolveApiDataPath(relativeOrAbsolute: string): string {
  if (path.isAbsolute(relativeOrAbsolute)) {
    return relativeOrAbsolute;
  }

  return path.resolve(API_PACKAGE_ROOT, relativeOrAbsolute);
}
