// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PARSER — tokens in, an `ast.ts` tree out. A straight recursive descent
// with a precedence-climbing expression parser, following the Lua 5.4 grammar
// for everything the lexer admits.
//
// The one deliberate departure: a statement that is neither an assignment nor a
// call is refused by name ("syntax error near …") rather than being silently
// accepted as an expression statement, because the commonest mistake in a
// hand-copied hook is a stray expression where an assignment was meant, and
// Lua's own message for it is famously unhelpful.

import type {
  BinOp,
  Block,
  Chunk,
  Expr,
  FunctionBody,
  Stat,
  TableField,
  UnOp,
} from "./ast.ts";
import { LuaSyntaxError, tokenize, type Token } from "./lexer.ts";

/** Binary operator precedences, `[left, right]`. A right-associative operator
 * (`..`, `^`) gets a right binding power BELOW its left one. */
const BINARY: Partial<Record<string, [number, number]>> = {
  or: [1, 1],
  and: [2, 2],
  "<": [3, 3],
  ">": [3, 3],
  "<=": [3, 3],
  ">=": [3, 3],
  "~=": [3, 3],
  "==": [3, 3],
  "..": [5, 4],
  "+": [6, 6],
  "-": [6, 6],
  "*": [7, 7],
  "/": [7, 7],
  "//": [7, 7],
  "%": [7, 7],
  "^": [10, 9],
};

/** Unary operators bind tighter than every binary one except `^`. */
const UNARY_PRIORITY = 8;

// NOTE — no TypeScript parameter properties anywhere under `src/lib/lua/`, and
// no other non-erasable syntax either. The content pipeline's generator
// (`scripts/generate-scripts.mjs`) imports this VM DIRECTLY under plain `node`
// to compile and check every authored script, and Node's strip-only type
// erasure refuses a constructor parameter modifier. Validating a script with a
// second, friendlier parser is exactly the drift the one-schema rule exists to
// prevent — so the fields are declared the long way instead.
class Parser {
  private pos = 0;
  private readonly tokens: Token[];
  private readonly chunk: string;

  constructor(tokens: Token[], chunk: string) {
    this.tokens = tokens;
    this.chunk = chunk;
  }

  /** The cursor never runs off the end: `tokenize` always appends an `eof`
   * token and every consumer stops on it, so the last token stands in for any
   * over-read. */
  private get tok(): Token {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1]!;
  }

  private fail(msg: string, line = this.tok.line): never {
    throw new LuaSyntaxError(msg, this.chunk, line);
  }

  private at(value: string): boolean {
    const t = this.tok;
    return (t.kind === "op" || t.kind === "name") && t.value === value;
  }

  private accept(value: string): boolean {
    if (!this.at(value)) return false;
    this.pos++;
    return true;
  }

  private expect(value: string, what = value): Token {
    if (!this.at(value)) {
      this.fail(`'${what}' expected near '${this.tok.value}'`);
    }
    return this.tokens[this.pos++]!;
  }

  private expectName(): string {
    const t = this.tok;
    if (t.kind !== "name" || t.keyword) {
      this.fail(`<name> expected near '${t.value}'`);
    }
    this.pos++;
    return t.value;
  }

  // ---- statements ---------------------------------------------------------

  parseChunk(): Chunk {
    const block = this.parseBlock();
    if (this.tok.kind !== "eof") {
      this.fail(`'<eof>' expected near '${this.tok.value}'`);
    }
    return { name: this.chunk, block };
  }

  /** A block runs until one of its terminators; `return` is only legal as the
   * last statement, which is what makes that list closed. */
  private parseBlock(): Block {
    const stats: Stat[] = [];
    for (;;) {
      const t = this.tok;
      if (
        t.kind === "eof" ||
        (t.kind === "name" &&
          (t.value === "end" ||
            t.value === "else" ||
            t.value === "elseif" ||
            t.value === "until"))
      ) {
        break;
      }
      if (this.accept(";")) continue;
      if (this.at("return")) {
        stats.push(this.parseReturn());
        break;
      }
      stats.push(this.parseStatement());
    }
    return { stats };
  }

  private parseReturn(): Stat {
    const line = this.tok.line;
    this.expect("return");
    const exprs: Expr[] =
      this.tok.kind === "eof" ||
      this.at("end") ||
      this.at("else") ||
      this.at("elseif") ||
      this.at("until") ||
      this.at(";")
        ? []
        : this.parseExprList();
    this.accept(";");
    return { kind: "return", exprs, line };
  }

  private parseStatement(): Stat {
    const line = this.tok.line;
    if (this.accept("do")) {
      const block = this.parseBlock();
      this.expect("end");
      return { kind: "do", block, line };
    }
    if (this.accept("while")) {
      const cond = this.parseExpr();
      this.expect("do");
      const block = this.parseBlock();
      this.expect("end");
      return { kind: "while", cond, block, line };
    }
    if (this.accept("repeat")) {
      const block = this.parseBlock();
      this.expect("until");
      const cond = this.parseExpr();
      return { kind: "repeat", block, cond, line };
    }
    if (this.accept("if")) return this.parseIf(line);
    if (this.accept("for")) return this.parseFor(line);
    if (this.accept("function")) return this.parseFunctionStat(line);
    if (this.accept("local")) return this.parseLocal(line);
    if (this.accept("break")) return { kind: "break", line };
    return this.parseExprStatement(line);
  }

  private parseIf(line: number): Stat {
    const clauses: { cond: Expr; block: Block }[] = [];
    for (;;) {
      const cond = this.parseExpr();
      this.expect("then");
      clauses.push({ cond, block: this.parseBlock() });
      if (!this.accept("elseif")) break;
    }
    const orelse = this.accept("else") ? this.parseBlock() : undefined;
    this.expect("end");
    return { kind: "if", clauses, orelse, line };
  }

  private parseFor(line: number): Stat {
    const first = this.expectName();
    if (this.accept("=")) {
      const from = this.parseExpr();
      this.expect(",");
      const to = this.parseExpr();
      const step = this.accept(",") ? this.parseExpr() : undefined;
      this.expect("do");
      const block = this.parseBlock();
      this.expect("end");
      return { kind: "fornum", name: first, from, to, step, block, line };
    }
    const names = [first];
    while (this.accept(",")) names.push(this.expectName());
    this.expect("in");
    const exprs = this.parseExprList();
    this.expect("do");
    const block = this.parseBlock();
    this.expect("end");
    return { kind: "forin", names, exprs, block, line };
  }

  /** `function a.b.c:d(...)` — desugared into an assignment, with `self`
   * prepended for the method form, exactly as the reference implementation
   * does. */
  private parseFunctionStat(line: number): Stat {
    let target: Expr = { kind: "name", name: this.expectName(), line };
    let label = (target as { name: string }).name;
    let isMethod = false;
    for (;;) {
      if (this.accept(".")) {
        const key = this.expectName();
        label += `.${key}`;
        target = {
          kind: "index",
          obj: target,
          key: { kind: "string", value: key, line },
          line,
        };
        continue;
      }
      if (this.accept(":")) {
        const key = this.expectName();
        label += `:${key}`;
        target = {
          kind: "index",
          obj: target,
          key: { kind: "string", value: key, line },
          line,
        };
        isMethod = true;
      }
      break;
    }
    const body = this.parseFunctionBody(label, line, isMethod);
    return {
      kind: "assign",
      targets: [target],
      exprs: [{ kind: "function", body, line }],
      line,
    };
  }

  private parseLocal(line: number): Stat {
    if (this.accept("function")) {
      const name = this.expectName();
      return {
        kind: "localfunc",
        name,
        body: this.parseFunctionBody(name, line, false),
        line,
      };
    }
    const names = [this.parseLocalName()];
    while (this.accept(",")) names.push(this.parseLocalName());
    const exprs = this.accept("=") ? this.parseExprList() : [];
    return { kind: "local", names, exprs, line };
  }

  /** A local may carry a 5.4 attribute (`<const>`, `<close>`). `<const>` is
   * accepted and ignored — it changes nothing a hook can observe — and
   * `<close>` is refused, because there are no to-be-closed resources in the
   * sandbox and honouring it would be a lie. */
  private parseLocalName(): string {
    const name = this.expectName();
    if (this.accept("<")) {
      const attrib = this.expectName();
      if (attrib !== "const") {
        this.fail(`unknown attribute '${attrib}' (only <const> is supported)`);
      }
      this.expect(">");
    }
    return name;
  }

  private parseExprStatement(line: number): Stat {
    const first = this.parseSuffixed();
    if (this.at("=") || this.at(",")) {
      const targets = [first];
      while (this.accept(",")) targets.push(this.parseSuffixed());
      this.expect("=");
      const exprs = this.parseExprList();
      for (const t of targets) {
        if (t.kind !== "name" && t.kind !== "index") {
          this.fail("cannot assign to this expression", t.line);
        }
      }
      return { kind: "assign", targets, exprs, line };
    }
    if (first.kind !== "call" && first.kind !== "method") {
      this.fail(`syntax error near '${this.tok.value}'`, line);
    }
    return { kind: "callstat", call: first, line };
  }

  // ---- expressions --------------------------------------------------------

  private parseExprList(): Expr[] {
    const exprs = [this.parseExpr()];
    while (this.accept(",")) exprs.push(this.parseExpr());
    return exprs;
  }

  private parseExpr(limit = 0): Expr {
    const line = this.tok.line;
    let left: Expr;
    const unop = this.unaryOp();
    if (unop) {
      this.pos++;
      left = {
        kind: "unop",
        op: unop,
        operand: this.parseExpr(UNARY_PRIORITY),
        line,
      };
    } else {
      left = this.parseSimple();
    }
    for (;;) {
      const t = this.tok;
      if (t.kind !== "op" && t.kind !== "name") break;
      const prec = BINARY[t.value];
      if (!prec || prec[0] <= limit) break;
      // `and`/`or` are names, not operators; guard against a variable happening
      // to be called `and` — impossible, since both are keywords — but also
      // against a non-keyword name landing in the table, which it cannot.
      if (t.kind === "name" && !t.keyword) break;
      const opLine = t.line;
      this.pos++;
      const right = this.parseExpr(prec[1]);
      left = { kind: "binop", op: t.value as BinOp, left, right, line: opLine };
    }
    return left;
  }

  private unaryOp(): UnOp | null {
    const t = this.tok;
    if (t.kind === "op" && (t.value === "-" || t.value === "#")) return t.value;
    if (t.kind === "name" && t.value === "not") return "not";
    return null;
  }

  private parseSimple(): Expr {
    const t = this.tok;
    const line = t.line;
    if (t.kind === "number") {
      this.pos++;
      return { kind: "number", value: t.num ?? 0, line };
    }
    if (t.kind === "string") {
      this.pos++;
      return { kind: "string", value: t.value, line };
    }
    if (this.accept("nil")) return { kind: "nil", line };
    if (this.accept("true")) return { kind: "true", line };
    if (this.accept("false")) return { kind: "false", line };
    if (this.accept("...")) return { kind: "vararg", line };
    if (this.accept("function")) {
      return {
        kind: "function",
        body: this.parseFunctionBody("<anonymous>", line, false),
        line,
      };
    }
    if (this.at("{")) return this.parseTable();
    return this.parseSuffixed();
  }

  private parsePrimary(): Expr {
    const t = this.tok;
    if (t.kind === "name" && !t.keyword) {
      this.pos++;
      return { kind: "name", name: t.value, line: t.line };
    }
    if (this.accept("(")) {
      const inner = this.parseExpr();
      this.expect(")");
      // Only a multi-value expression needs the wrapper — for everything else
      // the parentheses are pure grouping the tree already encodes.
      return inner.kind === "call" ||
        inner.kind === "method" ||
        inner.kind === "vararg"
        ? { kind: "paren", inner, line: inner.line }
        : inner;
    }
    return this.fail(`unexpected symbol near '${t.value}'`);
  }

  private parseSuffixed(): Expr {
    let expr = this.parsePrimary();
    for (;;) {
      const line = this.tok.line;
      if (this.accept(".")) {
        const key = this.expectName();
        expr = {
          kind: "index",
          obj: expr,
          key: { kind: "string", value: key, line },
          line,
        };
        continue;
      }
      if (this.accept("[")) {
        const key = this.parseExpr();
        this.expect("]");
        expr = { kind: "index", obj: expr, key, line };
        continue;
      }
      if (this.accept(":")) {
        const name = this.expectName();
        expr = {
          kind: "method",
          obj: expr,
          name,
          args: this.parseArgs(),
          line,
        };
        continue;
      }
      if (this.at("(") || this.at("{") || this.tok.kind === "string") {
        expr = { kind: "call", fn: expr, args: this.parseArgs(), line };
        continue;
      }
      return expr;
    }
  }

  /** Call arguments in all three Lua spellings: `f(a, b)`, `f{…}`, `f"…"`. */
  private parseArgs(): Expr[] {
    const t = this.tok;
    if (t.kind === "string") {
      this.pos++;
      return [{ kind: "string", value: t.value, line: t.line }];
    }
    if (this.at("{")) return [this.parseTable()];
    this.expect("(");
    if (this.accept(")")) return [];
    const args = this.parseExprList();
    this.expect(")");
    return args;
  }

  private parseTable(): Expr {
    const line = this.tok.line;
    this.expect("{");
    const fields: TableField[] = [];
    while (!this.at("}")) {
      if (this.accept("[")) {
        const key = this.parseExpr();
        this.expect("]");
        this.expect("=");
        fields.push({ kind: "keyed", key, value: this.parseExpr() });
      } else if (
        this.tok.kind === "name" &&
        !this.tok.keyword &&
        this.tokens[this.pos + 1]?.kind === "op" &&
        this.tokens[this.pos + 1]?.value === "="
      ) {
        const name = this.expectName();
        this.expect("=");
        fields.push({ kind: "named", name, value: this.parseExpr() });
      } else {
        fields.push({ kind: "positional", value: this.parseExpr() });
      }
      if (!this.accept(",") && !this.accept(";")) break;
    }
    this.expect("}");
    return { kind: "table", fields, line };
  }

  private parseFunctionBody(
    name: string,
    line: number,
    isMethod: boolean,
  ): FunctionBody {
    this.expect("(");
    const params: string[] = isMethod ? ["self"] : [];
    let vararg = false;
    if (!this.at(")")) {
      for (;;) {
        if (this.accept("...")) {
          vararg = true;
          break;
        }
        params.push(this.expectName());
        if (!this.accept(",")) break;
      }
    }
    this.expect(")");
    const block = this.parseBlock();
    this.expect("end");
    return { params, vararg, block, name, line };
  }
}

/** Parse a chunk of Lua source. Throws `LuaSyntaxError` naming the chunk and
 * line on the first problem. */
export function parse(src: string, chunkName: string): Chunk {
  return new Parser(tokenize(src, chunkName), chunkName).parseChunk();
}
