// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Returns exactly csv-reader's answer {columns, rows, errors} for every input
// {text, header}, but reads the text with native slice/indexOf/regex jumps instead
// of one character at a time:
//
// - A record whose whole line holds no quote and no stray CR is parsed in one
//   go: slice the line, split on commas, apply the width rule.
// - An unquoted field is one regex jump to the next comma/CR/LF (a stray CR
//   restarts the same field, exactly as the reference does).
// - A quoted field jumps from quote to quote with indexOf; doubled quotes are
//   collected as segments and joined once; line breaks inside quotes are
//   converted to LF and counted in one split/join pass.
// - Line numbers are kept exactly as the reference keeps them: every LF, CRLF
//   and lone CR inside quotes counts one line; a stray CR outside quotes
//   counts none; every error carries the line its record starts on.

const FIELD = /[^,\r\n]*([,\r\n]|$)/g;
const BREAKS = /\r\n|\r|\n/;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const n = text.length;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // Reads an unquoted field whose kept prefix is `init` ('' normally, '"'
  // when a quote never closed, the quoted value when reading junk after a
  // closing quote). Returns {value, ended, added}: ended 0 = comma,
  // 1 = line break, 2 = end of text; added = kept characters beyond `init`.
  function readUnquoted(init, recordLine, recordRow) {
    FIELD.lastIndex = pos;
    const m = FIELD.exec(text);
    let d = m.index + m[0].length - (m[1] === '' ? 0 : 1);
    let c = m[1] === '' ? -1 : m[1].charCodeAt(0);
    if (c === -1) {
      const added = d - pos;
      const value = init === '' ? text.slice(pos, d) : init + text.slice(pos, d);
      pos = n;
      return { value, ended: 2, added };
    }
    if (c === 44) {
      const added = d - pos;
      const value = init === '' ? text.slice(pos, d) : init + text.slice(pos, d);
      pos = d + 1;
      return { value, ended: 0, added };
    }
    if (c === 10) {
      const added = d - pos;
      const value = init === '' ? text.slice(pos, d) : init + text.slice(pos, d);
      pos = d + 1;
      line += 1;
      return { value, ended: 1, added };
    }
    if (d + 1 < n && text.charCodeAt(d + 1) === 10) {
      const added = d - pos;
      const value = init === '' ? text.slice(pos, d) : init + text.slice(pos, d);
      pos = d + 2;
      line += 1;
      return { value, ended: 1, added };
    }
    // A CR not followed by LF is dropped (stray_cr); the same field goes on.
    errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
    const parts = [init, text.slice(pos, d)];
    let added = d - pos;
    pos = d + 1;
    for (;;) {
      FIELD.lastIndex = pos;
      const m2 = FIELD.exec(text);
      const d2 = m2.index + m2[0].length - (m2[1] === '' ? 0 : 1);
      const c2 = m2[1] === '' ? -1 : m2[1].charCodeAt(0);
      if (c2 === -1) {
        if (pos < n) {
          parts.push(text.slice(pos));
          added += n - pos;
        }
        pos = n;
        return { value: parts.join(''), ended: 2, added };
      }
      d = d2;
      c = c2;
      if (c === 44) {
        parts.push(text.slice(pos, d));
        added += d - pos;
        pos = d + 1;
        return { value: parts.join(''), ended: 0, added };
      }
      if (c === 10) {
        parts.push(text.slice(pos, d));
        added += d - pos;
        pos = d + 1;
        line += 1;
        return { value: parts.join(''), ended: 1, added };
      }
      if (d + 1 < n && text.charCodeAt(d + 1) === 10) {
        parts.push(text.slice(pos, d));
        added += d - pos;
        pos = d + 2;
        line += 1;
        return { value: parts.join(''), ended: 1, added };
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      parts.push(text.slice(pos, d));
      added += d - pos;
      pos = d + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Returns
  // {value, ended} with the same ended codes as readUnquoted.
  function readQuoted(recordLine, recordRow) {
    const open = pos;
    const openLine = line;
    let q = pos + 1;
    let segments = null;
    let segStart = pos + 1;
    for (;;) {
      q = text.indexOf('"', q);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        pos = open + 1;
        line = openLine;
        return readUnquoted('"', recordLine, recordRow);
      }
      if (text.charCodeAt(q + 1) === 34) {
        if (segments === null) segments = [];
        segments.push(text.slice(segStart, q));
        q += 2;
        segStart = q;
        continue;
      }
      break;
    }
    let value;
    if (segments === null) {
      value = text.slice(pos + 1, q);
    } else {
      segments.push(text.slice(segStart, q));
      value = segments.join('"');
    }
    // Each CRLF or lone CR inside quotes is one LF; count the lines.
    if (value.indexOf('\r') !== -1 || value.indexOf('\n') !== -1) {
      const parts = value.split(BREAKS);
      line += parts.length - 1;
      value = parts.join('\n');
    }
    pos = q + 1;
    if (pos >= n) return { value, ended: 2 };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: 0 };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: 1 };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: 1 };
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = readUnquoted(value, recordLine, recordRow);
    if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  // Applies the width rule to a finished record (header, short/long row).
  function finishRecord(fields, recordLine, recordRow) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;

    // Fast path: the record's whole line holds no quote. A stray CR inside
    // the line (other than a CRLF at its end) falls through to the slow path.
    const lf = text.indexOf('\n', pos);
    const segEnd = lf === -1 ? n : lf;
    const seg = text.slice(pos, segEnd);
    let fields = null;
    if (seg.indexOf('"') === -1) {
      const ri = seg.indexOf('\r');
      if (ri === -1) {
        fields = seg.split(',');
      } else if (ri === seg.length - 1 && seg.indexOf('\r', ri + 1) === -1) {
        // A CR at the very end: CRLF when a LF follows, a stray CR at EOF.
        if (lf === -1) errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        fields = seg.slice(0, -1).split(',');
      }
    }
    if (fields !== null) {
      // A line that held only a stray CR is left with no characters: no record.
      if (fields.length === 1 && fields[0] === '') {
        if (lf !== -1) line += 1;
        pos = lf === -1 ? n : lf + 1;
        continue;
      }
      finishRecord(fields, recordLine, recordRow);
      if (lf !== -1) line += 1;
      pos = lf === -1 ? n : lf + 1;
      continue;
    }

    // Slow path: field by field, exactly as the reference reads them.
    const slowFields = [];
    let field;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted(recordLine, recordRow) : readUnquoted('', recordLine, recordRow);
      slowFields.push(field.value);
    } while (field.ended === 0);

    // A line that held only stray CRs is left with no characters: no record.
    if (slowFields.length === 1 && slowFields[0] === '' && !quoted) continue;
    finishRecord(slowFields, recordLine, recordRow);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
