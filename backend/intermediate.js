/**
 * PHASE 4: INTERMEDIATE CODE GENERATION
 * Generates Three-Address Code (TAC) from AST.
 */

let tempCounter = 0;
let labelCounter = 0;

function newTemp() { return `t${++tempCounter}`; }
function newLabel() { return `L${++labelCounter}`; }

function generateIntermediate(ast) {
  tempCounter = 0;
  labelCounter = 0;
  const instructions = [];
  for (const node of ast) {
    generateStatement(node, instructions);
    instructions.push({ type: 'blank' });
  }
  const code = instructions.map(formatInstruction).filter(l => l !== null);
  return { code, instructions };
}

function generateStatement(node, instructions) {
  if (!node) return;
  switch (node.nodeType) {
    case 'Declaration': {
      if (node.init) {
        const r = generateExpression(node.init, instructions);
        instructions.push({ type: 'assign', target: node.name, value: r });
      }
      break;
    }
    case 'Assignment': {
      const r = generateExpression(node.value, instructions);
      instructions.push({ type: 'assign', target: node.name, value: r });
      break;
    }
    case 'DoWhile': {
      const lbl = newLabel();
      instructions.push({ type: 'label', name: lbl });
      for (const s of node.body) generateStatement(s, instructions);
      const c = generateExpression(node.condition, instructions);
      instructions.push({ type: 'if_goto', condition: c, label: lbl });
      break;
    }
    case 'While': {
      const start = newLabel(), end = newLabel();
      instructions.push({ type: 'label', name: start });
      const c = generateExpression(node.condition, instructions);
      const neg = newTemp();
      instructions.push({ type: 'unary', target: neg, operator: '!', operand: c });
      instructions.push({ type: 'if_goto', condition: neg, label: end });
      for (const s of node.body) generateStatement(s, instructions);
      instructions.push({ type: 'goto', label: start });
      instructions.push({ type: 'label', name: end });
      break;
    }
    case 'If': {
      const elseLbl = newLabel(), endLbl = newLabel();
      const c = generateExpression(node.condition, instructions);
      const neg = newTemp();
      instructions.push({ type: 'unary', target: neg, operator: '!', operand: c });
      instructions.push({ type: 'if_goto', condition: neg, label: node.alternate ? elseLbl : endLbl });
      for (const s of node.consequent) generateStatement(s, instructions);
      if (node.alternate) {
        instructions.push({ type: 'goto', label: endLbl });
        instructions.push({ type: 'label', name: elseLbl });
        for (const s of node.alternate) generateStatement(s, instructions);
      }
      instructions.push({ type: 'label', name: endLbl });
      break;
    }
    case 'For': {
      if (node.init) generateStatement(node.init, instructions);
      const start = newLabel(), end = newLabel();
      instructions.push({ type: 'label', name: start });
      if (node.condition) {
        const c = generateExpression(node.condition, instructions);
        const neg = newTemp();
        instructions.push({ type: 'unary', target: neg, operator: '!', operand: c });
        instructions.push({ type: 'if_goto', condition: neg, label: end });
      }
      for (const s of node.body) generateStatement(s, instructions);
      if (node.update) generateStatement(node.update, instructions);
      instructions.push({ type: 'goto', label: start });
      instructions.push({ type: 'label', name: end });
      break;
    }
    case 'FunctionCall': {
      for (const a of node.args) {
        const r = generateExpression(a, instructions);
        instructions.push({ type: 'param', value: r });
      }
      instructions.push({ type: 'call', name: node.name, argCount: node.args.length });
      break;
    }
    case 'Return': {
      if (node.value) {
        const r = generateExpression(node.value, instructions);
        instructions.push({ type: 'return', value: r });
      } else {
        instructions.push({ type: 'return', value: null });
      }
      break;
    }
  }
}

function generateExpression(node, instructions) {
  if (!node) return '0';
  switch (node.nodeType) {
    case 'Number': case 'Float': return String(node.value);
    case 'String': return node.value;
    case 'Char': return node.value;
    case 'Identifier': return node.name;
    case 'BinaryExpr': {
      const l = generateExpression(node.left, instructions);
      const r = generateExpression(node.right, instructions);
      const t = newTemp();
      instructions.push({ type: 'binary', target: t, left: l, operator: node.operator, right: r });
      return t;
    }
    case 'UnaryExpr': {
      const op = generateExpression(node.operand, instructions);
      const t = newTemp();
      instructions.push({ type: 'unary', target: t, operator: node.operator, operand: op });
      return t;
    }
    case 'TypeCoercion': {
      const op = generateExpression(node.operand, instructions);
      const t = newTemp();
      instructions.push({ type: 'coercion', target: t, coercion: node.coercion, operand: op });
      return t;
    }
    case 'FunctionCall': {
      for (const a of node.args) {
        const r = generateExpression(a, instructions);
        instructions.push({ type: 'param', value: r });
      }
      const t = newTemp();
      instructions.push({ type: 'call_assign', target: t, name: node.name, argCount: node.args.length });
      return t;
    }
    default: return '?';
  }
}

function formatInstruction(instr) {
  switch (instr.type) {
    case 'assign': return `${instr.target} = ${instr.value}`;
    case 'binary': return `${instr.target} = ${instr.left} ${instr.operator} ${instr.right}`;
    case 'unary': return `${instr.target} = ${instr.operator}${instr.operand}`;
    case 'coercion': return `${instr.target} = ${instr.coercion}(${instr.operand})`;
    case 'label': return `${instr.name}:`;
    case 'if_goto': return `if ${instr.condition} goto ${instr.label}`;
    case 'goto': return `goto ${instr.label}`;
    case 'param': return `param ${instr.value}`;
    case 'call': return `call ${instr.name}, ${instr.argCount}`;
    case 'call_assign': return `${instr.target} = call ${instr.name}, ${instr.argCount}`;
    case 'return': return instr.value ? `return ${instr.value}` : 'return';
    case 'blank': return '';
    default: return null;
  }
}

module.exports = { generateIntermediate };
