/**
 * PHASE 3: SEMANTIC ANALYZER
 * 
 * Performs type checking and semantic validation on the AST.
 * 
 * Responsibilities:
 *   - Build a symbol table from declarations
 *   - Annotate expressions with types (int, float)
 *   - Insert type coercion nodes (inttofloat) where needed
 *   - Validate conditions evaluate to boolean
 *   - Report type mismatch errors
 * 
 * Output:
 *   - annotatedTrees: ASTs with type annotations
 *   - symbolTable: { name → type }
 *   - typeChecks: list of checks performed
 *   - errors: list of semantic errors
 */

/**
 * Perform semantic analysis.
 * @param {Array} ast - Array of AST nodes from syntax analysis.
 * @returns {{ annotatedTrees, symbolTable, typeChecks, errors }}
 */
function semanticAnalyze(ast) {
  const symbolTable = {};
  const typeChecks = [];
  const errors = [];

  // First pass: collect declarations to build symbol table
  for (const node of ast) {
    collectDeclarations(node, symbolTable);
  }

  // Second pass: annotate and type-check each statement
  const annotatedTrees = ast.map(node => annotateNode(node, symbolTable, typeChecks, errors));

  return {
    annotatedTrees,
    symbolTable,
    typeChecks,
    errors
  };
}

/**
 * Collect variable declarations into the symbol table.
 */
function collectDeclarations(node, symbolTable) {
  if (!node) return;

  if (node.nodeType === 'Declaration') {
    symbolTable[node.name] = node.dataType;
  }

  // Recurse into compound statements
  if (node.nodeType === 'DoWhile' || node.nodeType === 'While') {
    if (node.body) node.body.forEach(n => collectDeclarations(n, symbolTable));
  }
  if (node.nodeType === 'If') {
    if (node.consequent) node.consequent.forEach(n => collectDeclarations(n, symbolTable));
    if (node.alternate) node.alternate.forEach(n => collectDeclarations(n, symbolTable));
  }
  if (node.nodeType === 'For') {
    if (node.init) collectDeclarations(node.init, symbolTable);
    if (node.body) node.body.forEach(n => collectDeclarations(n, symbolTable));
  }
}

/**
 * Annotate a single AST node with type information.
 * Returns a new node with `resultType` fields.
 */
function annotateNode(node, symbolTable, typeChecks, errors) {
  if (!node) return null;

  switch (node.nodeType) {
    case 'Declaration': {
      let initAnnotated = null;
      if (node.init) {
        initAnnotated = annotateExpr(node.init, symbolTable, typeChecks, errors);
        const initType = getType(initAnnotated);
        if (initType && initType !== node.dataType) {
          if (node.dataType === 'float' && initType === 'int') {
            typeChecks.push({
              check: `${node.name}: int → float coercion on initialization`,
              status: 'warning'
            });
            initAnnotated = {
              nodeType: 'TypeCoercion',
              coercion: 'inttofloat',
              operand: initAnnotated,
              resultType: 'float'
            };
          } else if (node.dataType === 'int' && initType === 'float') {
            typeChecks.push({
              check: `${node.name}: possible precision loss float → int`,
              status: 'warning'
            });
          }
        } else {
          typeChecks.push({
            check: `${node.name}: ${node.dataType} = ${initType || 'unknown'} ✓`,
            status: 'ok'
          });
        }
      }
      return { ...node, init: initAnnotated, resultType: node.dataType };
    }

    case 'Assignment': {
      const valAnnotated = annotateExpr(node.value, symbolTable, typeChecks, errors);
      const varType = symbolTable[node.name];
      const valType = getType(valAnnotated);

      if (!varType) {
        // Infer type from value
        if (valType) {
          symbolTable[node.name] = valType;
          typeChecks.push({
            check: `${node.name}: inferred type ${valType}`,
            status: 'ok'
          });
        } else {
          errors.push(`Undeclared variable '${node.name}'`);
        }
      } else if (valType && varType !== valType) {
        if (varType === 'float' && valType === 'int') {
          typeChecks.push({
            check: `${node.name}: int → float coercion`,
            status: 'warning'
          });
          return {
            ...node,
            value: {
              nodeType: 'TypeCoercion',
              coercion: 'inttofloat',
              operand: valAnnotated,
              resultType: 'float'
            },
            resultType: varType
          };
        } else {
          typeChecks.push({
            check: `${node.name}: type mismatch (${varType} vs ${valType})`,
            status: 'error'
          });
          errors.push(`Type mismatch: cannot assign ${valType} to ${varType} variable '${node.name}'`);
        }
      } else {
        typeChecks.push({
          check: `${node.name}: ${varType} = ${valType || 'unknown'} ✓`,
          status: 'ok'
        });
      }

      return { ...node, value: valAnnotated, resultType: varType || valType };
    }

    case 'DoWhile':
    case 'While': {
      const condAnnotated = annotateExpr(node.condition, symbolTable, typeChecks, errors);
      const condType = getType(condAnnotated);
      if (condType && condType !== 'boolean' && condType !== 'int') {
        errors.push(`Condition in ${node.nodeType} must evaluate to boolean/int, got ${condType}`);
        typeChecks.push({
          check: `${node.nodeType} condition: expected boolean, got ${condType}`,
          status: 'error'
        });
      } else {
        typeChecks.push({
          check: `${node.nodeType} condition: evaluates to ${condType || 'boolean'} ✓`,
          status: 'ok'
        });
      }
      const bodyAnnotated = node.body.map(n => annotateNode(n, symbolTable, typeChecks, errors));
      return { ...node, condition: condAnnotated, body: bodyAnnotated };
    }

    case 'If': {
      const condAnnotated = annotateExpr(node.condition, symbolTable, typeChecks, errors);
      const condType = getType(condAnnotated);
      typeChecks.push({
        check: `if condition: evaluates to ${condType || 'boolean'} ✓`,
        status: condType === 'float' ? 'warning' : 'ok'
      });
      const consAnnotated = node.consequent.map(n => annotateNode(n, symbolTable, typeChecks, errors));
      const altAnnotated = node.alternate ? node.alternate.map(n => annotateNode(n, symbolTable, typeChecks, errors)) : null;
      return { ...node, condition: condAnnotated, consequent: consAnnotated, alternate: altAnnotated };
    }

    case 'For': {
      const initAnnotated = node.init ? annotateNode(node.init, symbolTable, typeChecks, errors) : null;
      const condAnnotated = node.condition ? annotateExpr(node.condition, symbolTable, typeChecks, errors) : null;
      const updateAnnotated = node.update ? annotateNode(node.update, symbolTable, typeChecks, errors) : null;
      if (condAnnotated) {
        typeChecks.push({
          check: `for condition: evaluates to ${getType(condAnnotated) || 'boolean'} ✓`,
          status: 'ok'
        });
      }
      const bodyAnnotated = node.body.map(n => annotateNode(n, symbolTable, typeChecks, errors));
      return { ...node, init: initAnnotated, condition: condAnnotated, update: updateAnnotated, body: bodyAnnotated };
    }

    case 'FunctionCall': {
      const argsAnnotated = node.args.map(a => annotateExpr(a, symbolTable, typeChecks, errors));
      typeChecks.push({
        check: `${node.name}() call with ${argsAnnotated.length} arg(s) ✓`,
        status: 'ok'
      });
      return { ...node, args: argsAnnotated, resultType: 'void' };
    }

    case 'Return': {
      const valAnnotated = node.value ? annotateExpr(node.value, symbolTable, typeChecks, errors) : null;
      typeChecks.push({
        check: `return ${valAnnotated ? getType(valAnnotated) : 'void'} ✓`,
        status: 'ok'
      });
      return { ...node, value: valAnnotated };
    }

    default:
      return node;
  }
}

/**
 * Annotate an expression node and determine its type.
 */
function annotateExpr(node, symbolTable, typeChecks, errors) {
  if (!node) return null;

  switch (node.nodeType) {
    case 'Number':
      return { ...node, resultType: 'int' };

    case 'Float':
      return { ...node, resultType: 'float' };

    case 'String':
      return { ...node, resultType: 'string' };

    case 'Char':
      return { ...node, resultType: 'char' };

    case 'Identifier': {
      const t = symbolTable[node.name];
      if (!t) {
        // Don't error for undeclared — might be used before declaration
        return { ...node, resultType: 'int' }; // assume int
      }
      return { ...node, resultType: t };
    }

    case 'BinaryExpr': {
      let leftA = annotateExpr(node.left, symbolTable, typeChecks, errors);
      let rightA = annotateExpr(node.right, symbolTable, typeChecks, errors);
      const lt = getType(leftA);
      const rt = getType(rightA);

      let resultType = 'int';

      // Comparison operators produce boolean
      if (['>', '<', '>=', '<=', '==', '!='].includes(node.operator)) {
        resultType = 'boolean';
        if (lt !== rt && lt && rt && lt !== 'unknown' && rt !== 'unknown') {
          typeChecks.push({
            check: `${lt} ${node.operator} ${rt}: comparison with implicit coercion`,
            status: 'warning'
          });
        }
      } else {
        // Arithmetic — type promotion
        if (lt === 'float' || rt === 'float') {
          resultType = 'float';
          if (lt === 'int') {
            leftA = {
              nodeType: 'TypeCoercion',
              coercion: 'inttofloat',
              operand: leftA,
              resultType: 'float'
            };
            typeChecks.push({
              check: `int ${node.operator} float → insert inttofloat (left)`,
              status: 'warning'
            });
          }
          if (rt === 'int') {
            rightA = {
              nodeType: 'TypeCoercion',
              coercion: 'inttofloat',
              operand: rightA,
              resultType: 'float'
            };
            typeChecks.push({
              check: `float ${node.operator} int → insert inttofloat (right)`,
              status: 'warning'
            });
          }
        }
      }

      return { ...node, left: leftA, right: rightA, resultType };
    }

    case 'UnaryExpr': {
      const operandA = annotateExpr(node.operand, symbolTable, typeChecks, errors);
      return { ...node, operand: operandA, resultType: getType(operandA) };
    }

    case 'FunctionCall': {
      const argsAnnotated = node.args.map(a => annotateExpr(a, symbolTable, typeChecks, errors));
      return { ...node, args: argsAnnotated, resultType: 'int' };
    }

    default:
      return node;
  }
}

/**
 * Extract the type from an annotated node.
 */
function getType(node) {
  if (!node) return null;
  if (node.resultType) return node.resultType;
  if (node.nodeType === 'Number') return 'int';
  if (node.nodeType === 'Float') return 'float';
  if (node.nodeType === 'String') return 'string';
  return null;
}

module.exports = { semanticAnalyze };
