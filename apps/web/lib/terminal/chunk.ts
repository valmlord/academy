import { INPUT_MAX_UNITS } from "./protocol";

/**
 * Splits terminal input into `input` frames of at most `maxUnits` UTF-16 units each (a large paste would
 * otherwise exceed the service's 8192-unit limit and close the connection). A cut never falls inside a
 * surrogate pair, so no chunk starts with a low surrogate and every character reaches the shell whole.
 */
export function chunkInput(text: string, maxUnits: number = INPUT_MAX_UNITS): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxUnits, text.length);
    const isInsidePair =
      end < text.length &&
      isHighSurrogate(text.charCodeAt(end - 1)) &&
      isLowSurrogate(text.charCodeAt(end));
    if (isInsidePair && end - 1 > start) end -= 1;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
