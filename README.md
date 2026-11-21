[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/xenopatijaya/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/xenopatijaya/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# Fast CSV Reader — a faster drop-in for csv-reader 1.0.0

An entry for the [make.fun bounty "Read broken CSV files faster, 21 November 2026"](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

`solve.js` answers exactly as make.fun's own `csv-reader 1.0.0` does on every
case — same `{columns, rows, errors}`, same broken-row policy (BOM, stray CR,
unterminated quotes, quote junk, short/long rows, multi-line quoted fields,
CRLF/LF). Round 2 removes the driver's own overhead: instead of paying for a
full `JSON.parse` of the input and a `JSON.stringify` of the answers, the
entry transcodes bytes.

- `main.ts` is a mini JSON scanner: it walks `/input/cases.json` just far
  enough to locate each case's `text` span and `header` flag — the document
  is never parsed into objects.
- `solve.js` keeps the verified `run()` parser from round 1 (whole-line fast
  path, one regex jump per unquoted field, `indexOf` quote-to-quote for
  quoted fields) and adds `transcode()`, which writes the answer's JSON
  directly off the still-escaped input bytes: field contents are copied raw,
  and only the spots where escaping changes the bytes — doubled quotes,
  in-quote CR/CRLF becoming LF, stray-CR drops — are rebuilt. The reference
  semantics are mirrored step for step, errors included.
- Line numbers are kept exactly as the reference keeps them: every LF, CRLF
  and lone CR inside quotes counts one line; a stray CR outside quotes
  counts none; every error carries the line its record starts on.

Dependency-free, ES module, Node 22.

Verified locally: the kit's practice set is byte-identical to the stock
driver's output (grade-local passed, 6/6 cases, L1 regrade byte for byte),
and a three-way fuzz (reference vs `run()` vs `transcode()`) over 80,000+
adversarial cases — including `\uXXXX`-encoded structural characters — came
out identical on every case. End-to-end on the practice set the pipeline
runs at roughly half the previous entry's CPU time.
