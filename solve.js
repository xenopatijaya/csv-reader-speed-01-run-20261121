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

// ---------------------------------------------------------------------------
// transcode(raw, s, e, header): the same answer as run(), returned as a JSON
// string, read straight off the JSON-escaped text raw[s..e) of one case (the
// content of the case's "text" string in cases.json, escapes still in it).
// The scan runs on the decoded token stream — a comma, quote, LF or CR is
// structural in whatever escape form it takes — while field contents are
// copied from the input bytes wherever they stand: already JSON-escaped
// exactly as the answer needs them. Only the readings that change bytes are
// rebuilt: a doubled quote becomes one, a CR or CRLF inside quotes becomes
// LF, a stray CR outside quotes is dropped. The reading follows csv-reader
// 1.0.0 step for step, errors included.

export function transcode(raw, s, e, header) {
  let pos = s;
  let line = 1;
  let errsOut = '';
  let errsCount = 0;
  let rowsOut = '';
  let rowsCount = 0;
  let columnsFrag = null;
  let width = -1;

  function pushErr(frag) {
    if (errsCount > 0) errsOut += ',';
    errsOut += frag;
    errsCount += 1;
  }

  // BOM: a literal U+FEFF or a \uFEFF escape at the very start is dropped.
  if (pos < e) {
    if (raw.charCodeAt(pos) === 0xfeff) pos += 1;
    else if (
      raw.charCodeAt(pos) === 92 && raw.charCodeAt(pos + 1) === 117 &&
      parseInt(raw.slice(pos + 2, pos + 6), 16) === 0xfeff
    ) pos += 6;
  }

  // The next comma or backslash in [from, e), or -1.
  function nextSep(from) {
    const a = raw.indexOf(',', from);
    const b = raw.indexOf('\\', from);
    const i = b === -1 || (a !== -1 && a < b) ? a : b;
    return i !== -1 && i < e ? i : -1;
  }

  // The next backslash in [from, e), or -1.
  function nextEsc(from) {
    const i = raw.indexOf('\\', from);
    return i !== -1 && i < e ? i : -1;
  }

  // Classifies the escape at i (raw[i] is a backslash): returns [kind, len]
  // with kind 0 = content, 1 = LF, 2 = CR, 3 = quote, 4 = comma.
  function escInfo(i) {
    const c2 = raw.charCodeAt(i + 1);
    if (c2 === 110) return [1, 2];
    if (c2 === 114) return [2, 2];
    if (c2 === 34) return [3, 2];
    if (c2 === 117) {
      const h = parseInt(raw.slice(i + 2, i + 6), 16);
      if (h === 10) return [1, 6];
      if (h === 13) return [2, 6];
      if (h === 34) return [3, 6];
      if (h === 44) return [4, 6];
      return [0, 6];
    }
    return [0, 2];
  }

  // Is there an LF token at i (raw[i] a backslash)? Returns its length or 0.
  function lfAt(i) {
    if (raw.charCodeAt(i) !== 92) return 0;
    const info = escInfo(i);
    return info[0] === 1 ? info[1] : 0;
  }

  // Is there a CRLF token pair at i? Returns its total length or 0.
  function crlfAt(i) {
    if (raw.charCodeAt(i) !== 92) return 0;
    const info = escInfo(i);
    if (info[0] !== 2) return 0;
    const l = lfAt(i + info[1]);
    return l > 0 ? info[1] + l : 0;
  }

  function errFrag(code, recordLine, recordRow) {
    return '{"code":"' + code + '","line":' + recordLine + ',"row":' + recordRow + '}';
  }

  // The unquoted reading's results, shared to keep the hot loop free of
  // per-field objects: F_FRAG the field's escaped content, F_ENDED how it
  // ended (0 comma, 1 line break, 2 end of text), F_KEPT whether characters
  // beyond the init fragment were kept (the quote_junk test).
  let F_FRAG = '';
  let F_ENDED = 2;
  let F_KEPT = false;

  // Unquoted reading in escaped space. initFrag is the escaped content
  // already kept ('' normally, '\"' after an unterminated quote, the quoted
  // value for junk after a closing quote).
  function readUnquotedEsc(initFrag, recordLine, recordRow) {
    let parts = null;
    let segStart = pos;
    let anyKept = false;
    for (;;) {
      const i = nextSep(pos);
      if (i === -1) {
        const tail = raw.slice(segStart, e);
        if (tail !== '') anyKept = true;
        pos = e;
        F_FRAG = parts === null
          ? (initFrag === '' ? tail : initFrag + tail)
          : initFrag + parts.join('') + tail;
        F_ENDED = 2;
        F_KEPT = anyKept;
        return;
      }
      if (raw.charCodeAt(i) === 44) {
        const tail = raw.slice(segStart, i);
        if (tail !== '') anyKept = true;
        pos = i + 1;
        F_FRAG = parts === null
          ? (initFrag === '' ? tail : initFrag + tail)
          : initFrag + parts.join('') + tail;
        F_ENDED = 0;
        F_KEPT = anyKept;
        return;
      }
      const info = escInfo(i);
      const kind = info[0];
      const len = info[1];
      if (kind === 4) {
        const tail = raw.slice(segStart, i);
        if (tail !== '') anyKept = true;
        pos = i + len;
        F_FRAG = parts === null
          ? (initFrag === '' ? tail : initFrag + tail)
          : initFrag + parts.join('') + tail;
        F_ENDED = 0;
        F_KEPT = anyKept;
        return;
      }
      if (kind === 1) {
        const tail = raw.slice(segStart, i);
        if (tail !== '') anyKept = true;
        pos = i + len;
        line += 1;
        F_FRAG = parts === null
          ? (initFrag === '' ? tail : initFrag + tail)
          : initFrag + parts.join('') + tail;
        F_ENDED = 1;
        F_KEPT = anyKept;
        return;
      }
      if (kind === 2) {
        const cl = crlfAt(i);
        if (cl > 0) {
          const tail = raw.slice(segStart, i);
          if (tail !== '') anyKept = true;
          pos = i + cl;
          line += 1;
          F_FRAG = parts === null
            ? (initFrag === '' ? tail : initFrag + tail)
            : initFrag + parts.join('') + tail;
          F_ENDED = 1;
          F_KEPT = anyKept;
          return;
        }
        // A stray CR is dropped; the same field goes on.
        pushErr(errFrag('stray_cr', recordLine, recordRow));
        if (i > segStart) anyKept = true;
        if (parts === null) parts = [];
        parts.push(raw.slice(segStart, i));
        pos = i + len;
        segStart = pos;
        continue;
      }
      // Content as it stands (a literal quote among it): it stays in the
      // current segment.
      anyKept = true;
      pos = i + len;
    }
  }

  // Quoted reading in escaped space; pos is at the opening quote token.
  // Returns {frag, ended} with the same ended codes.
  function readQuotedEsc(recordLine, recordRow) {
    const open = pos;
    const openLine = line;
    let q = pos + escInfo(pos)[1];
    let segStart = q;
    let parts = null;
    let lineCount = 0;
    for (;;) {
      const i = nextEsc(q);
      if (i === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pushErr(errFrag('unterminated_quote', recordLine, recordRow));
        pos = open + escInfo(open)[1];
        line = openLine;
        readUnquotedEsc('\\"', recordLine, recordRow);
        return { frag: F_FRAG, ended: F_ENDED };
      }
      const info = escInfo(i);
      const kind = info[0];
      const len = info[1];
      if (kind === 3) {
        // A quote: doubled, or the closing quote.
        const j = i + len;
        if (j < e && raw.charCodeAt(j) === 92 && escInfo(j)[0] === 3) {
          if (parts === null) parts = [];
          parts.push(raw.slice(segStart, i), '\\"');
          q = j + escInfo(j)[1];
          segStart = q;
          continue;
        }
        let value;
        if (parts === null) {
          value = raw.slice(segStart, i);
        } else {
          parts.push(raw.slice(segStart, i));
          value = parts.join('');
        }
        line += lineCount;
        pos = j;
        if (pos >= e) return { frag: value, ended: 2 };
        if (raw.charCodeAt(pos) === 44) {
          pos += 1;
          return { frag: value, ended: 0 };
        }
        if (raw.charCodeAt(pos) === 92) {
          const ci = escInfo(pos);
          if (ci[0] === 4) {
            pos += ci[1];
            return { frag: value, ended: 0 };
          }
          if (ci[0] === 1) {
            pos += ci[1];
            line += 1;
            return { frag: value, ended: 1 };
          }
          const cl = crlfAt(pos);
          if (cl > 0) {
            pos += cl;
            line += 1;
            return { frag: value, ended: 1 };
          }
        }
        // What follows the closing quote is appended as it stands.
        readUnquotedEsc(value, recordLine, recordRow);
        if (F_KEPT) pushErr(errFrag('quote_junk', recordLine, recordRow));
        return { frag: F_FRAG, ended: F_ENDED };
      }
      if (kind === 2) {
        // A CR or CRLF inside quotes is one LF.
        if (parts === null) parts = [];
        parts.push(raw.slice(segStart, i), '\\n');
        const cl = crlfAt(i);
        q = i + (cl > 0 ? cl : len);
        segStart = q;
        lineCount += 1;
        continue;
      }
      if (kind === 1) {
        lineCount += 1;
        q = i + len;
        continue;
      }
      q = i + len; // a comma escape or plain content: it stands
    }
  }

  function finishRecord(fields, recordLine, recordRow) {
    const count = fields.length;
    if (width < 0) width = count;
    if (header && columnsFrag === null) {
      columnsFrag = '["' + fields.join('","') + '"]';
      return;
    }
    let rowFrags = fields;
    if (count < width) {
      pushErr(
        '{"code":"short_row","line":' + recordLine + ',"row":' + recordRow + ',"fields":' + count + '}'
      );
      rowFrags = fields.slice();
      while (rowFrags.length < width) rowFrags.push('');
    } else if (count > width) {
      const extra = fields.slice(width);
      pushErr(
        '{"code":"long_row","line":' + recordLine + ',"row":' + recordRow + ',"extra":["' +
          extra.join('","') + '"]}'
      );
      rowFrags = fields.slice(0, width);
    }
    if (rowsCount > 0) rowsOut += ',';
    rowsOut += '["' + rowFrags.join('","') + '"]';
    rowsCount += 1;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < e && raw.charCodeAt(pos) === 92) {
      const l1 = lfAt(pos);
      if (l1 > 0) {
        pos += l1;
        line += 1;
        continue;
      }
      const cl = crlfAt(pos);
      if (cl > 0) {
        pos += cl;
        line += 1;
        continue;
      }
      break;
    }
    if (pos >= e) break;

    const recordLine = line;
    const recordRow = header && columnsFrag === null ? null : rowsCount;

    // Fast path: scan the record's extent by its escapes alone; if it holds
    // no quote token and no stray CR, its fields are the raw extent split on
    // commas.
    let fields = null;
    {
      let i = pos;
      let termAt = -1;
      let termLen = 0;
      let slow = false;
      for (;;) {
        const j = nextEsc(i);
        if (j === -1) {
          termAt = e;
          termLen = 0;
          break;
        }
        const info = escInfo(j);
        if (info[0] === 3 || info[0] === 4) {
          slow = true;
          break;
        }
        if (info[0] === 1) {
          termAt = j;
          termLen = info[1];
          break;
        }
        if (info[0] === 2) {
          const cl = crlfAt(j);
          if (cl > 0) {
            termAt = j;
            termLen = cl;
            break;
          }
          slow = true;
          break;
        }
        i = j + info[1];
      }
      if (!slow) {
        fields = raw.slice(pos, termAt).split(',');
        if (termLen > 0) line += 1;
        pos = termAt + termLen;
      }
    }
    if (fields !== null) {
      finishRecord(fields, recordLine, recordRow);
      continue;
    }

    // Slow path: field by field, exactly as the reference reads them.
    const slowFields = [];
    let ended = 0;
    let quoted = false;
    do {
      quoted = raw.charCodeAt(pos) === 92 && escInfo(pos)[0] === 3;
      if (quoted) {
        const f = readQuotedEsc(recordLine, recordRow);
        slowFields.push(f.frag);
        ended = f.ended;
      } else {
        readUnquotedEsc('', recordLine, recordRow);
        slowFields.push(F_FRAG);
        ended = F_ENDED;
      }
    } while (ended === 0);

    // A line that held only stray CRs is left with no characters: no record.
    if (slowFields.length === 1 && slowFields[0] === '' && !quoted) continue;
    finishRecord(slowFields, recordLine, recordRow);
  }

  return (
    '{"columns":' + (header ? (columnsFrag ?? '[]') : 'null') +
    ',"rows":[' + rowsOut +
    '],"errors":[' + errsOut + ']}'
  );
}
