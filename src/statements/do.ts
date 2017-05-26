import {
  Compiler
} from "../compiler";

import {
  intType
} from "../types";

import {
  WasmType,
  WasmExpression,
  WasmStatement
} from "../wasm";

export function compileDo(compiler: Compiler, node: ts.DoStatement, onVariable: (node: ts.VariableDeclaration) => number): WasmStatement {
  const op = compiler.module;

  compiler.enterBreakContext();
  const label = compiler.currentBreakLabel;

  const context = op.loop("break$" + label, op.block("continue$" + label, [
    compiler.compileStatement(node.statement, onVariable),
    op.break("break$" + label, op.i32.eqz(compiler.maybeConvertValue(node.expression, compiler.compileExpression(node.expression, intType), (<any>node.expression).wasmType, intType, true)))
  ]));

  compiler.leaveBreakContext();
  return context;
}
