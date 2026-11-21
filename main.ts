// csv-reader 1.0.0 drop-in driver: reads every case from /input/cases.json and
// writes /output/answers.json, one answer per case and in the cases' order.
// The answers are csv-reader 1.0.0's own readings (solve.js's run returns them
// as values); this driver takes them as JSON text straight off the file's
// bytes instead — solve.js's transcode reads each case's text where it lies
// in cases.json, still JSON-escaped, and writes the answer's JSON directly,
// so no case is ever parsed into objects only to be stringified again.
// Outside a container MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for
// /input and /output.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// V8's incremental marking off, set before solve.js is imported so all of its
// work runs under it (the house baseline runs with --no-incremental-marking).
setFlagsFromString('--no-incremental-marking');

/** solve.js, imported by its URL (a .js module carries no types). */
const { transcode } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  transcode: (raw: string, s: number, e: number, header: boolean) => string;
};

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const raw = readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8');
const N = raw.length;
let p = 0;

/** The index of the closing quote of the string whose content starts at `from`. */
function strEnd(from: number): number {
  let i = from;
  for (;;) {
    const q = raw.indexOf('"', i);
    const b = raw.indexOf('\\', i);
    if (b !== -1 && (q === -1 || b < q)) {
      i = b + 2; // skip the escaped character
      continue;
    }
    return q === -1 ? N : q;
  }
}

function skipWs(): void {
  while (p < N) {
    const c = raw.charCodeAt(p);
    if (c === 32 || c === 10 || c === 13 || c === 9) p += 1;
    else break;
  }
}

/** Skips one JSON value at p (string, number, literal, object or array). */
function skipValue(): void {
  skipWs();
  const c = raw.charCodeAt(p);
  if (c === 34) {
    p = strEnd(p + 1) + 1;
    return;
  }
  if (c === 123 || c === 91) {
    const open = c;
    const close = c === 123 ? 125 : 93;
    let depth = 0;
    while (p < N) {
      const ch = raw.charCodeAt(p);
      if (ch === 34) {
        p = strEnd(p + 1) + 1;
        continue;
      }
      if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        p += 1;
        if (depth === 0) return;
        continue;
      }
      p += 1;
    }
    return;
  }
  while (p < N) {
    const ch = raw.charCodeAt(p);
    if (ch === 44 || ch === 125 || ch === 93 || ch === 32 || ch === 10 || ch === 13 || ch === 9) break;
    p += 1;
  }
}

/** Reads the object key at p (p at its opening quote); p ends past its closing quote. */
function readKey(): string {
  const end = strEnd(p + 1);
  const k = raw.slice(p + 1, end);
  p = end + 1;
  return k;
}

const out: string[] = ['['];
let firstCase = true;

skipWs();
p += 1; // '['
skipWs();
if (raw.charCodeAt(p) !== 93) {
  for (;;) {
    skipWs();
    p += 1; // '{' of the case
    let textS = -1;
    let textE = -1;
    let header = false;
    for (;;) {
      skipWs();
      if (raw.charCodeAt(p) === 125) {
        p += 1;
        break;
      }
      const key = readKey();
      skipWs();
      p += 1; // ':'
      if (key === 'input') {
        skipWs();
        p += 1; // '{' of the input
        for (;;) {
          skipWs();
          if (raw.charCodeAt(p) === 125) {
            p += 1;
            break;
          }
          const k2 = readKey();
          skipWs();
          p += 1; // ':'
          if (k2 === 'text') {
            skipWs();
            textS = p + 1;
            textE = strEnd(textS);
            p = textE + 1;
          } else if (k2 === 'header') {
            skipWs();
            header = raw.charCodeAt(p) === 116; // 't'
            skipValue();
          } else {
            skipValue();
          }
          skipWs();
          if (raw.charCodeAt(p) === 44) {
            p += 1;
            continue;
          }
          if (raw.charCodeAt(p) === 125) {
            p += 1;
            break;
          }
        }
      } else {
        skipValue();
      }
      skipWs();
      if (raw.charCodeAt(p) === 44) {
        p += 1;
        continue;
      }
      if (raw.charCodeAt(p) === 125) {
        p += 1;
        break;
      }
    }
    if (!firstCase) out.push(',');
    firstCase = false;
    out.push(transcode(raw, textS, textE, header));
    skipWs();
    if (raw.charCodeAt(p) === 44) {
      p += 1;
      continue;
    }
    break; // ']'
  }
}
out.push(']');
writeFileSync(join(OUTPUT_DIR, 'answers.json'), out.join(''));
