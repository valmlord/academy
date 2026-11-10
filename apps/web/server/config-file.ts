import { readFile } from "node:fs/promises";
import path from "node:path";
import { CONFIG_MISSING, CONFIG_NO_OBJECT, CONFIG_NOT_JSON } from "./strings.ts";

// Next's generated standalone server.js embeds the build's config and hands it to Next through
// __NEXT_PRIVATE_STANDALONE_CONFIG; the custom server reads the same config from the build output instead
// (#32 design 3.1 step 1). Only the three fixed F2 messages leave this module: a parse error's own message
// would carry the file's contents.

export class StandaloneConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StandaloneConfigError";
  }
}

/** The JSON text of `config` in `<dir>/.next/required-server-files.json`; throws `StandaloneConfigError`. */
export async function readStandaloneConfig(dir: string): Promise<string> {
  let text: string;
  try {
    text = await readFile(path.join(dir, ".next", "required-server-files.json"), "utf8");
  } catch {
    throw new StandaloneConfigError(CONFIG_MISSING);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new StandaloneConfigError(CONFIG_NOT_JSON);
  }
  const config: unknown =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? Reflect.get(parsed, "config")
      : undefined;
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new StandaloneConfigError(CONFIG_NO_OBJECT);
  }
  return JSON.stringify(config);
}
