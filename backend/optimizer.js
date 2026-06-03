/**
 * PHASE 5: CODE OPTIMIZATION
 * Optimizes TAC by removing redundant temporaries, combining expressions,
 * and eliminating unnecessary assignments. All optimizations are derived
 * from the intermediate code — NOT hardcoded.
 */

function optimizeCode(tacLines) {
  // Parse TAC lines into structured instructions
  let instrs = tacLines.filter(l => l.trim() !== '').map(parseTACLine);
  const applied = [];

  // Pass 1: Remove redundant temporaries
  // If t1 = expr, then x = t1 → x = expr (when t1 is used only once)
  instrs = removeRedundantTemps(instrs, applied);

  // Pass 2: Constant folding
  instrs = constantFold(instrs, applied);

  // Pass 3: Remove dead temporaries (assigned but never read)
  instrs = removeDeadTemps(instrs, applied);

  // Convert back to string lines
  const optimized = instrs.map(instrToString).filter(l => l !== null);

  return { optimized, applied };
}

/**
 * Parse a TAC string line into a structured object.
 */
function parseTACLine(line) {
  line = line.trim();
  if (!line) return { type: 'blank', raw: '' };

  // Label: L1:
  if (/^L\d+:$/.test(line)) {
    return { type: 'label', name: line.slice(0, -1), raw: line };
  }

  // goto L1
  if (/^goto\s+/.test(line)) {
    return { type: 'goto', label: line.split(/\s+/)[1], raw: line };
  }

  // if x goto L1
  if (/^if\s+/.test(line)) {
    const m = line.match(/^if\s+(\S+)\s+goto\s+(\S+)$/);
    if (m) return { type: 'if_goto', condition: m[1], label: m[2], raw: line };
    return { type: 'raw', raw: line };
  }

  // param x
  if (/^param\s+/.test(line)) {
    return { type: 'param', value: line.split(/\s+/)[1], raw: line };
  }

  // call name, n
  if (/^call\s+/.test(line)) {
    return { type: 'call', raw: line };
  }

  // return x
  if (/^return/.test(line)) {
    const parts = line.split(/\s+/);
    return { type: 'return', value: parts[1] || null, raw: line };
  }

  // Assignment: x = ...
  const eqIdx = line.indexOf('=');
  if (eqIdx > 0) {
    const target = line.substring(0, eqIdx).trim();
    let rhs = line.substring(eqIdx + 1).trim();

    // Check for call assignment: x = call name, n
    if (rhs.startsWith('call ')) {
      return { type: 'call_assign', target, rhs, raw: line };
    }

    // Check for coercion: x = inttofloat(y)
    const coercionMatch = rhs.match(/^(\w+)\((.+)\)$/);
    if (coercionMatch && ['inttofloat', 'floattoint'].includes(coercionMatch[1])) {
      return { type: 'coercion', target, coercion: coercionMatch[1], operand: coercionMatch[2], raw: line };
    }

    // Unary: x = !y or x = -y
    if (/^[!-]\w+$/.test(rhs)) {
      return { type: 'unary', target, operator: rhs[0], operand: rhs.substring(1), raw: line };
    }

    // Binary: x = a op b
    // Need to handle operators: + - * / % > < >= <= == !=
    const binMatch = rhs.match(/^(\S+)\s+([+\-*/%]|>=|<=|==|!=|>|<)\s+(\S+)$/);
    if (binMatch) {
      return { type: 'binary', target, left: binMatch[1], operator: binMatch[2], right: binMatch[3], raw: line };
    }

    // Simple assignment: x = y
    return { type: 'assign', target, value: rhs, raw: line };
  }

  return { type: 'raw', raw: line };
}

/**
 * Remove redundant temporaries.
 * Pattern: t1 = expr; x = t1; → x = expr (when t1 used only in x = t1)
 */
function removeRedundantTemps(instrs, applied) {
  let changed = true;
  while (changed) {
    changed = false;
    // Count usages of each temporary
    const usageCount = {};
    for (const instr of instrs) {
      const refs = getReferencedVars(instr);
      for (const ref of refs) {
        if (isTemp(ref)) {
          usageCount[ref] = (usageCount[ref] || 0) + 1;
        }
      }
    }

    for (let i = 0; i < instrs.length - 1; i++) {
      const curr = instrs[i];
      const next = instrs[i + 1];

      // Check: curr defines a temp, next is a simple assignment from that temp
      if (curr.target && isTemp(curr.target) &&
          next.type === 'assign' && next.value === curr.target &&
          (usageCount[curr.target] || 0) <= 1) {
        // Replace: change curr's target to next's target
        const newInstr = { ...curr, target: next.target };
        newInstr.raw = instrToString(newInstr);
        instrs[i] = newInstr;
        instrs.splice(i + 1, 1);
        applied.push(`Removed redundant temp ${curr.target}: merged into ${next.target}`);
        changed = true;
        break;
      }
    }
  }
  return instrs;
}

/**
 * Constant folding: evaluate constant expressions at compile time.
 */
function constantFold(instrs, applied) {
  for (let i = 0; i < instrs.length; i++) {
    const instr = instrs[i];
    if (instr.type === 'binary') {
      const l = parseFloat(instr.left);
      const r = parseFloat(instr.right);
      if (!isNaN(l) && !isNaN(r)) {
        let result;
        switch (instr.operator) {
          case '+': result = l + r; break;
          case '-': result = l - r; break;
          case '*': result = l * r; break;
          case '/': result = r !== 0 ? Math.floor(l / r) : null; break;
          case '%': result = r !== 0 ? l % r : null; break;
          default: result = null;
        }
        if (result !== null) {
          instrs[i] = { type: 'assign', target: instr.target, value: String(result), raw: '' };
          instrs[i].raw = instrToString(instrs[i]);
          applied.push(`Constant folded: ${instr.left} ${instr.operator} ${instr.right} → ${result}`);
        }
      }
    }
  }
  return instrs;
}

/**
 * Remove dead temporaries: if a temp is assigned but never referenced, remove it.
 */
function removeDeadTemps(instrs, applied) {
  let changed = true;
  while (changed) {
    changed = false;
    // Find all referenced variables
    const referenced = new Set();
    for (const instr of instrs) {
      const refs = getReferencedVars(instr);
      refs.forEach(r => referenced.add(r));
    }

    for (let i = 0; i < instrs.length; i++) {
      const instr = instrs[i];
      if (instr.target && isTemp(instr.target) && !referenced.has(instr.target)) {
        // Check this temp isn't part of a call (which has side effects)
        if (instr.type !== 'call_assign') {
          applied.push(`Removed dead temp: ${instr.target}`);
          instrs.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
  }
  return instrs;
}

/** Check if a variable name is a temporary */
function isTemp(name) {
  return /^t\d+$/.test(name);
}

/** Get all variable names referenced (read, not assigned) in an instruction */
function getReferencedVars(instr) {
  const refs = [];
  if (instr.type === 'binary') {
    refs.push(instr.left, instr.right);
  } else if (instr.type === 'assign') {
    refs.push(instr.value);
  } else if (instr.type === 'unary') {
    refs.push(instr.operand);
  } else if (instr.type === 'coercion') {
    refs.push(instr.operand);
  } else if (instr.type === 'param') {
    refs.push(instr.value);
  } else if (instr.type === 'if_goto') {
    refs.push(instr.condition);
  } else if (instr.type === 'return' && instr.value) {
    refs.push(instr.value);
  }
  return refs.filter(r => r && typeof r === 'string' && /^[a-zA-Z_]/.test(r));
}

/** Convert instruction back to string */
function instrToString(instr) {
  switch (instr.type) {
    case 'assign': return `${instr.target} = ${instr.value}`;
    case 'binary': return `${instr.target} = ${instr.left} ${instr.operator} ${instr.right}`;
    case 'unary': return `${instr.target} = ${instr.operator}${instr.operand}`;
    case 'coercion': return `${instr.target} = ${instr.coercion}(${instr.operand})`;
    case 'label': return `${instr.name}:`;
    case 'goto': return `goto ${instr.label}`;
    case 'if_goto': return `if ${instr.condition} goto ${instr.label}`;
    case 'param': return `param ${instr.value}`;
    case 'call': return instr.raw;
    case 'call_assign': return instr.raw || `${instr.target} = ${instr.rhs}`;
    case 'return': return instr.value ? `return ${instr.value}` : 'return';
    case 'blank': return '';
    case 'raw': return instr.raw;
    default: return instr.raw || '';
  }
}

module.exports = { optimizeCode };
