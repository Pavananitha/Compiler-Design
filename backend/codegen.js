/**
 * PHASE 6: TARGET CODE GENERATION
 * Generates assembly-like instructions from optimized TAC.
 * Uses register-based instructions: LD, ST, ADD, SUB, MUL, DIV, MOD, CMP, JNE, JMP
 */

function generateTargetCode(optimizedLines) {
  const asm = [];
  let regCounter = 0;
  // Map variable → register it's currently loaded in
  const regMap = {};

  function getReg() { return `R${regCounter++}`; }

  function findOrLoadReg(varName) {
    if (regMap[varName]) return regMap[varName];
    const r = getReg();
    // Numbers get loaded as immediate values
    if (/^\d+(\.\d+)?$/.test(varName)) {
      asm.push(`LD ${r}, #${varName}`);
    } else if (varName.startsWith('"')) {
      asm.push(`LD ${r}, ${varName}`);
    } else {
      asm.push(`LD ${r}, ${varName}`);
    }
    regMap[varName] = r;
    return r;
  }

  const opMap = { '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD' };
  const cmpOps = new Set(['>', '<', '>=', '<=', '==', '!=']);

  for (const line of optimizedLines) {
    const trimmed = line.trim();
    if (!trimmed) { asm.push(''); continue; }

    // Label
    if (/^L\d+:$/.test(trimmed)) {
      asm.push(trimmed);
      continue;
    }

    // goto
    if (/^goto\s+/.test(trimmed)) {
      asm.push(`JMP ${trimmed.split(/\s+/)[1]}`);
      continue;
    }

    // if x goto L
    const ifMatch = trimmed.match(/^if\s+(\S+)\s+goto\s+(\S+)$/);
    if (ifMatch) {
      const cond = ifMatch[1];
      const label = ifMatch[2];
      const r = findOrLoadReg(cond);
      asm.push(`CMP ${r}, #0`);
      asm.push(`JNE ${label}`);
      continue;
    }

    // param
    if (/^param\s+/.test(trimmed)) {
      const val = trimmed.split(/\s+/)[1];
      const r = findOrLoadReg(val);
      asm.push(`PUSH ${r}`);
      continue;
    }

    // call
    if (/^call\s+/.test(trimmed) && !trimmed.includes('=')) {
      asm.push(`CALL ${trimmed.split(/\s+/)[1].replace(',', '')}`);
      continue;
    }

    // return
    if (/^return/.test(trimmed)) {
      const parts = trimmed.split(/\s+/);
      if (parts[1]) {
        const r = findOrLoadReg(parts[1]);
        asm.push(`MOV R0, ${r}`);
      }
      asm.push('RET');
      continue;
    }

    // Assignment: target = ...
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const target = trimmed.substring(0, eqIdx).trim();
      let rhs = trimmed.substring(eqIdx + 1).trim();

      // call assignment
      if (rhs.startsWith('call ')) {
        asm.push(`CALL ${rhs.split(/\s+/)[1].replace(',', '')}`);
        const r = getReg();
        asm.push(`MOV ${r}, R0`);
        asm.push(`ST ${target}, ${r}`);
        regMap[target] = r;
        continue;
      }

      // coercion
      const coercionMatch = rhs.match(/^(\w+)\((.+)\)$/);
      if (coercionMatch && ['inttofloat', 'floattoint'].includes(coercionMatch[1])) {
        const r = findOrLoadReg(coercionMatch[2]);
        const rDest = getReg();
        asm.push(`CVT ${rDest}, ${r}`);
        asm.push(`ST ${target}, ${rDest}`);
        regMap[target] = rDest;
        continue;
      }

      // Unary
      if (/^[!-]\w+$/.test(rhs)) {
        const op = rhs[0];
        const operand = rhs.substring(1);
        const r = findOrLoadReg(operand);
        const rDest = getReg();
        asm.push(`MOV ${rDest}, ${r}`);
        asm.push(op === '!' ? `NOT ${rDest}` : `NEG ${rDest}`);
        asm.push(`ST ${target}, ${rDest}`);
        regMap[target] = rDest;
        continue;
      }

      // Binary
      const binMatch = rhs.match(/^(\S+)\s+([+\-*/%]|>=|<=|==|!=|>|<)\s+(\S+)$/);
      if (binMatch) {
        const [, left, op, right] = binMatch;
        const rLeft = findOrLoadReg(left);
        const rDest = getReg();
        asm.push(`MOV ${rDest}, ${rLeft}`);
        if (cmpOps.has(op)) {
          const rRight = findOrLoadReg(right);
          asm.push(`CMP ${rDest}, ${rRight}`);
          // Store comparison result
          const flagMap = { '>': 'SGT', '<': 'SLT', '>=': 'SGE', '<=': 'SLE', '==': 'SEQ', '!=': 'SNE' };
          asm.push(`${flagMap[op]} ${rDest}`);
        } else {
          const asmOp = opMap[op] || op;
          if (/^\d+(\.\d+)?$/.test(right)) {
            asm.push(`${asmOp} ${rDest}, #${right}`);
          } else {
            const rRight = findOrLoadReg(right);
            asm.push(`${asmOp} ${rDest}, ${rRight}`);
          }
        }
        asm.push(`ST ${target}, ${rDest}`);
        regMap[target] = rDest;
        continue;
      }

      // Simple assignment: target = value
      if (/^\d+(\.\d+)?$/.test(rhs)) {
        const r = getReg();
        asm.push(`LD ${r}, #${rhs}`);
        asm.push(`ST ${target}, ${r}`);
        regMap[target] = r;
      } else {
        const r = findOrLoadReg(rhs);
        asm.push(`ST ${target}, ${r}`);
        regMap[target] = r;
      }
      continue;
    }

    // Fallback
    asm.push(`; ${trimmed}`);
  }

  return asm;
}

module.exports = { generateTargetCode };
