// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SYNTAX TREE the parser builds and the interpreter walks. Plain data —
// no methods, no cycles — so a compiled chunk can be cached, shared between
// runs, and (in the session server) shared between two worlds without any
// chance of one run's execution leaking into another's.
//
// Every node carries `line`, because the only thing a modder can act on when a
// hook misbehaves is a line number in their own file.

export type Expr =
  | { kind: "nil"; line: number }
  | { kind: "true"; line: number }
  | { kind: "false"; line: number }
  | { kind: "vararg"; line: number }
  | { kind: "number"; value: number; line: number }
  | { kind: "string"; value: string; line: number }
  | { kind: "name"; name: string; line: number }
  | { kind: "index"; obj: Expr; key: Expr; line: number }
  /** `( e )` — kept as its own node because parentheses TRUNCATE a multi-value
   * expression to one value: `f((g()))` passes exactly one argument however
   * many `g` returns. Dropping the node would silently change arity. */
  | { kind: "paren"; inner: Expr; line: number }
  | { kind: "call"; fn: Expr; args: Expr[]; line: number }
  | { kind: "method"; obj: Expr; name: string; args: Expr[]; line: number }
  | { kind: "function"; body: FunctionBody; line: number }
  | { kind: "table"; fields: TableField[]; line: number }
  | { kind: "binop"; op: BinOp; left: Expr; right: Expr; line: number }
  | { kind: "unop"; op: UnOp; operand: Expr; line: number };

export type TableField =
  /** `[k] = v` */
  | { kind: "keyed"; key: Expr; value: Expr }
  /** `name = v` */
  | { kind: "named"; name: string; value: Expr }
  /** a positional entry; the LAST one expands multiple returns */
  | { kind: "positional"; value: Expr };

export type BinOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "//"
  | "%"
  | "^"
  | ".."
  | "=="
  | "~="
  | "<"
  | "<="
  | ">"
  | ">="
  | "and"
  | "or";

export type UnOp = "-" | "not" | "#";

/** A function's parameters and body. `vararg` is the trailing `...`. */
export type FunctionBody = {
  readonly params: string[];
  readonly vararg: boolean;
  readonly block: Block;
  /** For error messages: `xp_to_level_up`, `<anonymous>`, `t:method`. */
  readonly name: string;
  readonly line: number;
};

export type Block = { readonly stats: Stat[] };

export type Stat =
  | { kind: "local"; names: string[]; exprs: Expr[]; line: number }
  | { kind: "assign"; targets: Expr[]; exprs: Expr[]; line: number }
  | { kind: "callstat"; call: Expr; line: number }
  | { kind: "do"; block: Block; line: number }
  | { kind: "while"; cond: Expr; block: Block; line: number }
  | { kind: "repeat"; block: Block; cond: Expr; line: number }
  | {
      kind: "if";
      clauses: { cond: Expr; block: Block }[];
      orelse?: Block;
      line: number;
    }
  | {
      kind: "fornum";
      name: string;
      from: Expr;
      to: Expr;
      step?: Expr;
      block: Block;
      line: number;
    }
  | {
      kind: "forin";
      names: string[];
      exprs: Expr[];
      block: Block;
      line: number;
    }
  | { kind: "return"; exprs: Expr[]; line: number }
  | { kind: "break"; line: number }
  /** `local function f() … end` — distinct from `local f = function…` because
   * the name is in scope inside its own body (so a hook may recurse). */
  | { kind: "localfunc"; name: string; body: FunctionBody; line: number };

/** A parsed chunk: its top-level block plus the name errors are reported
 * against. */
export type Chunk = {
  readonly name: string;
  readonly block: Block;
};
