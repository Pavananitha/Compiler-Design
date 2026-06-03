/**
 * PHASE 1: LEXICAL ANALYZER
 * 
 * Breaks source code into a stream of tokens.
 * Recognizes: keywords, identifiers, numbers, strings, operators, separators.
 * 
 * Identifiers are mapped to id1, id2, id3, ... for consistent reference
 * throughout all compiler phases. Same identifier always gets the same id.
 * 
 * Output:
 *   - tokenStream: array of { type, value, line } (identifiers replaced with idN)
 *   - tokensByLine: tokens grouped by source line number
 *   - tokenTable: deduplicated table of { type, lexeme }
 *   - identifierMap: { originalName → idN }
 *   - symbolTable: array of { id, name, type, line }
 *   - errors: array of error messages
 */

// Keywords recognized by our subset of C
const KEYWORDS = new Set([
  'int', 'float', 'double', 'char', 'void',
  'if', 'else', 'while', 'do', 'for',
  'return', 'printf', 'scanf', 'main'
]);

// Multi-character operators (order matters — longest first)
const MULTI_OPERATORS = ['==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/='];

// Single-character operators
const SINGLE_OPERATORS = new Set(['+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|']);

// Separators
const SEPARATORS = new Set(['(', ')', '{', '}', '[', ']', ';', ',']);

/**
 * Perform lexical analysis on the given source code.
 * @param {string} code - The raw source code string.
 * @returns {{ tokenStream, tokensByLine, tokenTable, identifierMap, symbolTable, errors }}
 */
function lexicalAnalyze(code) {
  const tokens = [];
  const errors = [];
  let i = 0;
  let line = 1;

  while (i < code.length) {
    // ---- Whitespace ----
    if (code[i] === '\n') {
      line++;
      i++;
      continue;
    }
    if (/\s/.test(code[i])) {
      i++;
      continue;
    }

    // ---- Single-line comments ---- 
    if (code[i] === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }

    // ---- Multi-line comments ----
    if (code[i] === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < code.length - 1 && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') line++;
        i++;
      }
      i += 2; // skip */
      continue;
    }

    // ---- String literals ----
    if (code[i] === '"') {
      let str = '"';
      i++;
      while (i < code.length && code[i] !== '"') {
        if (code[i] === '\\') {
          str += code[i];
          i++;
        }
        if (i < code.length) {
          str += code[i];
          i++;
        }
      }
      if (i < code.length) {
        str += '"';
        i++; // skip closing quote
      }
      tokens.push({ type: 'STRING', value: str, line });
      continue;
    }

    // ---- Character literals ----
    if (code[i] === "'") {
      let ch = "'";
      i++;
      while (i < code.length && code[i] !== "'") {
        ch += code[i];
        i++;
      }
      if (i < code.length) {
        ch += "'";
        i++;
      }
      tokens.push({ type: 'CHAR_LITERAL', value: ch, line });
      continue;
    }

    // ---- Numbers (integers and floats) ----
    if (/\d/.test(code[i])) {
      let num = '';
      let isFloat = false;
      while (i < code.length && (/\d/.test(code[i]) || code[i] === '.')) {
        if (code[i] === '.') {
          if (isFloat) break; // second dot — stop
          isFloat = true;
        }
        num += code[i];
        i++;
      }
      tokens.push({ type: isFloat ? 'FLOAT_LITERAL' : 'NUMBER', value: num, line });
      continue;
    }

    // ---- Keywords & Identifiers ----
    if (/[a-zA-Z_]/.test(code[i])) {
      let word = '';
      while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) {
        word += code[i];
        i++;
      }
      if (KEYWORDS.has(word)) {
        tokens.push({ type: 'KEYWORD', value: word, line });
      } else {
        tokens.push({ type: 'IDENTIFIER', value: word, line });
      }
      continue;
    }

    // ---- Multi-character operators ----
    let matchedOp = null;
    for (const op of MULTI_OPERATORS) {
      if (code.substring(i, i + op.length) === op) {
        matchedOp = op;
        break;
      }
    }
    if (matchedOp) {
      tokens.push({ type: 'OPERATOR', value: matchedOp, line });
      i += matchedOp.length;
      continue;
    }

    // ---- Single-character operators ----
    if (SINGLE_OPERATORS.has(code[i])) {
      tokens.push({ type: 'OPERATOR', value: code[i], line });
      i++;
      continue;
    }

    // ---- Separators ----
    if (SEPARATORS.has(code[i])) {
      tokens.push({ type: 'SEPARATOR', value: code[i], line });
      i++;
      continue;
    }

    // ---- Preprocessor directives (skip) ----
    if (code[i] === '#') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }

    // ---- Unknown character ----
    errors.push({ message: `Unexpected character '${code[i]}'`, line });
    i++;
  }

  // ──────────────────────────────────────────────────
  // Build identifier map: originalName → idN
  // Each unique identifier gets a sequential number.
  // Same identifier always maps to the same idN.
  // ──────────────────────────────────────────────────
  const identifierMap = {};   // e.g. { num: 'id1', rev: 'id2', digit: 'id3' }
  let idCounter = 0;

  for (const token of tokens) {
    if (token.type === 'IDENTIFIER' && !identifierMap[token.value]) {
      idCounter++;
      identifierMap[token.value] = `id${idCounter}`;
    }
  }

  // ──────────────────────────────────────────────────
  // Build symbol table with type inference from context.
  // We look for patterns like: KEYWORD(type) IDENTIFIER(name)
  // to infer the data type of each identifier.
  // ──────────────────────────────────────────────────
  const identifierTypes = {};
  const TYPE_KEYWORDS = new Set(['int', 'float', 'double', 'char']);

  for (let j = 0; j < tokens.length; j++) {
    if (tokens[j].type === 'IDENTIFIER') {
      const name = tokens[j].value;
      if (identifierTypes[name]) continue; // already found type

      // Check if preceded by a type keyword (direct declaration)
      if (j > 0 && tokens[j - 1].type === 'KEYWORD' && TYPE_KEYWORDS.has(tokens[j - 1].value)) {
        identifierTypes[name] = tokens[j - 1].value;
      }
      // Check for comma-separated declarations: int a, b, c;
      // Trace back through commas to find the type keyword
      else if (j > 0 && tokens[j - 1].value === ',') {
        for (let k = j - 1; k >= 0; k--) {
          if (tokens[k].type === 'KEYWORD' && TYPE_KEYWORDS.has(tokens[k].value)) {
            identifierTypes[name] = tokens[k].value;
            break;
          }
          if (tokens[k].value === ';' || tokens[k].value === '{' || tokens[k].value === '}') break;
        }
      }
    }
  }

  // Size in bytes per data type
  const TYPE_SIZES = { int: 4, float: 4, double: 8, char: 1 };

  // Build the symbol table array with memory addresses
  let currentAddress = 1000;
  const symbolTable = Object.entries(identifierMap).map(([name, id]) => {
    const type = identifierTypes[name] || '-';
    const size = TYPE_SIZES[type] || 4; // default 4 bytes
    const address = currentAddress;
    currentAddress += size;
    return {
      id,
      name,
      type,
      size,
      address,
      line: tokens.find(t => t.type === 'IDENTIFIER' && t.value === name)?.line || '-'
    };
  });

  // ──────────────────────────────────────────────────
  // Replace identifier values in tokens with idN
  // Store original name for reference
  // ──────────────────────────────────────────────────
  const mappedTokens = tokens.map(t => {
    if (t.type === 'IDENTIFIER') {
      return {
        type: t.type,
        value: identifierMap[t.value],   // e.g. "id1" instead of "num"
        originalName: t.value,            // keep original for reference
        line: t.line
      };
    }
    return { ...t };
  });

  // ──────────────────────────────────────────────────
  // Group tokens by source line number
  // ──────────────────────────────────────────────────
  const tokensByLine = {};
  for (const t of mappedTokens) {
    if (!tokensByLine[t.line]) tokensByLine[t.line] = [];
    tokensByLine[t.line].push(t);
  }

  // ──────────────────────────────────────────────────
  // Build deduplicated token table
  // ──────────────────────────────────────────────────
  const seen = new Set();
  const tokenTable = [];
  for (const t of mappedTokens) {
    const key = `${t.type}::${t.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      tokenTable.push({ tokenType: t.type, lexeme: t.value });
    }
  }

  return {
    tokenStream: mappedTokens,
    tokensByLine,
    tokenTable,
    identifierMap,
    symbolTable,
    errors
  };
}

module.exports = { lexicalAnalyze };
