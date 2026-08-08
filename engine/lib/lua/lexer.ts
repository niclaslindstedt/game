// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LEXER. Source text in, a flat token array out, with every token carrying
// its line so a parse or runtime error can name a line in the modder's own
// file. Generic engine code — no game concepts here.
//
// The scanned dialect is Lua 5.4 minus the pieces the sandbox has no use for:
// there are no integer/float literal DISTINCTIONS (one number type — see
// value.ts), and `goto`/`::label::` are rejected outright rather than parsed
// and ignored, so a script that uses them fails at compile time with a reason
// instead of behaving differently from the Lua the author tested against.

/** Everything the parser distinguishes. Keywords arrive as `name` tokens with
 * `keyword: true` so the parser can compare on `value` alone. */
export type TokenKind = "name" | "number" | "string" | "op" | "eof";

export type Token = {
  readonly kind: TokenKind;
  /** The literal text for names/operators, the parsed value for numbers and
   * strings. */
  readonly value: string;
  readonly num?: number;
  readonly line: number;
  readonly keyword?: boolean;
};

/** A syntax error with the chunk name and line already folded in. */
export class LuaSyntaxError extends Error {
  readonly line: number;
  constructor(message: string, chunk: string, line: number) {
    super(`${chunk}:${line}: ${message}`);
    this.name = "LuaSyntaxError";
    this.line = line;
  }
}

const KEYWORDS = new Set([
  "and",
  "break",
  "do",
  "else",
  "elseif",
  "end",
  "false",
  "for",
  "function",
  "if",
  "in",
  "local",
  "nil",
  "not",
  "or",
  "repeat",
  "return",
  "then",
  "true",
  "until",
  "while",
]);

/** Rejected on sight, with a message that says what to write instead. Both are
 * real Lua, so silently mis-parsing them would be worse than refusing. */
const UNSUPPORTED = new Map([
  ["goto", "`goto` is not supported — use `break`, a flag, or an early return"],
  ["::", "labels are not supported — `goto` has no place in a hook"],
]);

// Longest first: the scanner takes the first that matches, so `...` must be
// tried before `..`, and `==` before `=`.
const OPERATORS = [
  "...",
  "..",
  "==",
  "~=",
  "<=",
  ">=",
  "//",
  "<<",
  ">>",
  "::",
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
  "#",
  "&",
  "~",
  "|",
  "<",
  ">",
  "=",
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  ";",
  ":",
  ",",
  ".",
];

// Every predicate takes `string | undefined`, because indexing past the end of
// the source is the normal way a scanner asks "is there more?" — and answering
// `false` there is exactly right for all four.
const isDigit = (c: string | undefined) =>
  c !== undefined && c >= "0" && c <= "9";
const isHexDigit = (c: string | undefined) =>
  isDigit(c) ||
  (c !== undefined && ((c >= "a" && c <= "f") || (c >= "A" && c <= "F")));
const isNameStart = (c: string | undefined) =>
  c !== undefined &&
  ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_");
const isNamePart = (c: string | undefined) => isNameStart(c) || isDigit(c);

/**
 * Tokenize a chunk. Throws `LuaSyntaxError` on the first malformed token —
 * scripts are compiled at build time (and at mod-compile time), so failing
 * loudly and early is the whole point.
 */
export function tokenize(src: string, chunk: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  const fail = (msg: string): never => {
    throw new LuaSyntaxError(msg, chunk, line);
  };

  /** A `[[ … ]]` / `[==[ … ]==]` body starting at `i`, or null when the
   * brackets at `i` are not a long-bracket opener at all. Shared by long
   * strings and long comments — the level counting is identical. */
  const longBracket = (): string | null => {
    if (src[i] !== "[") return null;
    let j = i + 1;
    let level = 0;
    while (src[j] === "=") {
      level++;
      j++;
    }
    if (src[j] !== "[") return null;
    j++;
    // A newline immediately after the opener is dropped, as in Lua.
    if (src[j] === "\r") j++;
    if (src[j] === "\n") {
      line++;
      j++;
    }
    const close = `]${"=".repeat(level)}]`;
    const end = src.indexOf(close, j);
    if (end < 0) fail("unfinished long string or comment");
    const body = src.slice(j, end);
    for (const c of body) if (c === "\n") line++;
    i = end + close.length;
    return body;
  };

  const readEscape = (): string => {
    const c = src[++i];
    switch (c) {
      case "n":
        i++;
        return "\n";
      case "t":
        i++;
        return "\t";
      case "r":
        i++;
        return "\r";
      case "a":
        i++;
        return "\x07";
      case "b":
        i++;
        return "\b";
      case "f":
        i++;
        return "\f";
      case "v":
        i++;
        return "\v";
      case "\\":
        i++;
        return "\\";
      case '"':
        i++;
        return '"';
      case "'":
        i++;
        return "'";
      case "\n":
        i++;
        line++;
        return "\n";
      case "x": {
        const hex = src.slice(i + 1, i + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) fail("hexadecimal digit expected");
        i += 3;
        return String.fromCharCode(Number.parseInt(hex, 16));
      }
      case "z": {
        i++;
        while (i < n && /\s/.test(src[i] ?? "")) {
          if (src[i] === "\n") line++;
          i++;
        }
        return "";
      }
      default: {
        if (c !== undefined && isDigit(c)) {
          let digits = "";
          while (digits.length < 3 && isDigit(src[i])) digits += src[i++];
          const code = Number.parseInt(digits, 10);
          if (code > 255) fail("decimal escape too large");
          return String.fromCharCode(code);
        }
        return fail(`invalid escape sequence '\\${c ?? ""}'`);
      }
    }
  };

  while (i < n) {
    const c = src[i];
    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r" || c === "\v" || c === "\f") {
      i++;
      continue;
    }
    // Comments — long form first, so `--[[ … ]]` is not read as `--` to EOL.
    if (c === "-" && src[i + 1] === "-") {
      i += 2;
      if (longBracket() !== null) continue;
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "[" && (src[i + 1] === "[" || src[i + 1] === "=")) {
      const startLine = line;
      const body = longBracket();
      if (body !== null) {
        tokens.push({ kind: "string", value: body, line: startLine });
        continue;
      }
    }
    if (c === '"' || c === "'") {
      const quote = c;
      const startLine = line;
      i++;
      let out = "";
      for (;;) {
        if (i >= n) fail("unfinished string");
        const ch = src[i];
        if (ch === quote) {
          i++;
          break;
        }
        if (ch === "\n") fail("unfinished string");
        if (ch === "\\") out += readEscape();
        else {
          out += ch;
          i++;
        }
      }
      tokens.push({ kind: "string", value: out, line: startLine });
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(src[i + 1]))) {
      const start = i;
      if (c === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
        i += 2;
        while (i < n && isHexDigit(src[i])) i++;
        const text = src.slice(start, i);
        tokens.push({
          kind: "number",
          value: text,
          num: Number.parseInt(text.slice(2), 16),
          line,
        });
        continue;
      }
      while (i < n && isDigit(src[i])) i++;
      if (src[i] === ".") {
        i++;
        while (i < n && isDigit(src[i])) i++;
      }
      if (src[i] === "e" || src[i] === "E") {
        i++;
        if (src[i] === "+" || src[i] === "-") i++;
        if (!isDigit(src[i])) fail("malformed number");
        while (i < n && isDigit(src[i])) i++;
      }
      const text = src.slice(start, i);
      const num = Number(text);
      if (Number.isNaN(num)) fail(`malformed number near '${text}'`);
      tokens.push({ kind: "number", value: text, num, line });
      continue;
    }
    if (isNameStart(c)) {
      const start = i;
      while (i < n && isNamePart(src[i])) i++;
      const text = src.slice(start, i);
      const banned = UNSUPPORTED.get(text);
      if (banned) fail(banned);
      tokens.push({
        kind: "name",
        value: text,
        line,
        keyword: KEYWORDS.has(text),
      });
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) {
      const banned = UNSUPPORTED.get(op);
      if (banned) fail(banned);
      tokens.push({ kind: "op", value: op, line });
      i += op.length;
      continue;
    }
    fail(`unexpected symbol near '${c}'`);
  }
  tokens.push({ kind: "eof", value: "<eof>", line });
  return tokens;
}
