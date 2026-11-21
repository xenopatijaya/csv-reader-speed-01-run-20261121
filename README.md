[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/xenopatijaya/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/xenopatijaya/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# Fast CSV Reader — a faster drop-in for csv-reader 1.0.0

An entry for the [make.fun bounty "Read broken CSV files faster, 21 November 2026"](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

`solve.js` answers exactly as make.fun's own `csv-reader 1.0.0` does on every
case — same `{columns, rows, errors}`, same broken-row policy (BOM, stray CR,
unterminated quotes, quote junk, short/long rows, multi-line quoted fields,
CRLF/LF) — but reads the text with native jumps instead of one character at
a time:

- A record whose whole line holds no quote and no stray CR is parsed in one
  go: slice the line, split on commas, apply the width rule.
- An unquoted field is one regex jump to the next comma, CR or LF (a stray
  CR restarts the same field, exactly as the reference does).
- A quoted field jumps from quote to quote with `indexOf`; doubled quotes
  are collected as segments and joined once; line breaks inside quotes are
  converted to LF and counted in one split/join pass.
- Line numbers are kept exactly as the reference keeps them: every LF, CRLF
  and lone CR inside quotes counts one line; a stray CR outside quotes
  counts none; every error carries the line its record starts on.

`main.ts` is the house baseline's driver, unchanged: it reads every case
from `/input/cases.json`, answers each with `run`, and writes
`/output/answers.json`. Dependency-free, ES module, Node 22.

Verified locally against the kit's practice set (6/6 identical to the
reference) and 5,000 randomized broken-CSV fuzz cases (5,000/5,000
identical), at roughly 3× the speed of the house baseline on the practice
set.
