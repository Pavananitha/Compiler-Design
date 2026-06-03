/**
 * PHASE 2: SYNTAX ANALYZER (Parser)
 * 
 * Builds Abstract Syntax Trees (ASTs) from the token stream.
 * Uses recursive-descent parsing for our C subset.
 * 
 * Supports:
 *   - Variable declarations: int x = expr;  (including comma-separated)
 *   - Assignments: x = expr;
 *   - do-while loops
 *   - while loops
 *   - printf("...", args)
 *   - return statements
 *   - Arithmetic expressions with proper precedence
 * 
 * Output: Array of AST nodes (one per top-level statement).
 */

class Parser {
  constructor(tokens) {
    // Filter out tokens that aren't meaningful for parsing
    this.tokens = tokens.filter(t => t.type !== 'COMMENT');
    this.pos = 0;
    this.errors = [];
  }

  // ---- Utility methods ----

  /** Peek at the current token without consuming it */
  peek() {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  /** Consume the current token and advance */
  consume() {
    const t = this.tokens[this.pos];
    this.pos++;
    return t;
  }

  /** Expect a specific token value; throw error if not found */
  expect(value) {
    const t = this.peek();
    if (!t || t.value !== value) {
      const found = t ? t.value : 'EOF';
      this.errors.push(`Expected '${value}' but found '${found}' at line ${t ? t.line : '?'}`);
      return null;
    }
    return this.consume();
  }

  /** Check if current token matches a value */
  match(value) {
    const t = this.peek();
    return t && t.value === value;
  }

  /** Check if current token matches a type */
  matchType(type) {
    const t = this.peek();
    return t && t.type === type;
  }

  // ---- Grammar rules ----

  /**
   * Parse the entire program.
   * program → statement*
   */
  parseProgram() {
    const statements = [];
    while (this.peek()) {
      // Skip function wrapper: int main() { ... }
      if (this.isTypeKeyword() && this.lookAhead(1, 'main')) {
        this.parseFunctionHeader();
        continue;
      }
      if (this.match('}')) {
        this.consume(); // closing brace of main
        continue;
      }
      const result = this.parseStatement();
      // parseDeclaration may return an array for comma-separated decls
      if (result) {
        if (Array.isArray(result)) {
          result.forEach(r => { if (r) statements.push(r); });
        } else {
          statements.push(result);
        }
      } else if (this.peek()) {
        this.consume(); // skip bad token to avoid infinite loop
      }
    }
    return statements;
  }

  /** Check if current token is a type keyword */
  isTypeKeyword() {
    const t = this.peek();
    return t && t.type === 'KEYWORD' && ['int', 'float', 'double', 'char', 'void'].includes(t.value);
  }

  /** Look ahead n tokens and check value */
  lookAhead(n, value) {
    const idx = this.pos + n;
    return idx < this.tokens.length && this.tokens[idx].value === value;
  }

  /** Skip past function header: type name ( params ) { */
  parseFunctionHeader() {
    this.consume(); // type
    this.consume(); // name
    this.expect('(');
    // skip params
    while (this.peek() && !this.match(')')) this.consume();
    this.expect(')');
    this.expect('{');
  }

  /** Parse statements into a body array until closing brace. Handles array returns from comma-separated declarations. */
  parseBody() {
    const body = [];
    while (this.peek() && !this.match('}')) {
      const result = this.parseStatement();
      if (result) {
        if (Array.isArray(result)) {
          result.forEach(r => { if (r) body.push(r); });
        } else {
          body.push(result);
        }
      } else if (this.peek() && !this.match('}')) {
        this.consume();
      }
    }
    return body;
  }

  /**
   * Parse a single statement.
   * statement → declaration | assignment | doWhile | while | printf | return | exprStmt
   */
  parseStatement() {
    const t = this.peek();
    if (!t) return null;

    // Declaration: int x = expr;
    if (this.isTypeKeyword() && !this.lookAhead(1, 'main')) {
      return this.parseDeclaration();
    }

    // do-while
    if (t.value === 'do') {
      return this.parseDoWhile();
    }

    // while
    if (t.value === 'while') {
      return this.parseWhile();
    }

    // if
    if (t.value === 'if') {
      return this.parseIf();
    }

    // for
    if (t.value === 'for') {
      return this.parseFor();
    }

    // printf / scanf
    if (t.value === 'printf' || t.value === 'scanf') {
      return this.parsePrintf();
    }

    // return
    if (t.value === 'return') {
      return this.parseReturn();
    }

    // Assignment or expression statement
    if (t.type === 'IDENTIFIER') {
      return this.parseAssignmentOrExpr();
    }

    // Skip unknown
    this.errors.push(`Unexpected token '${t.value}' at line ${t.line}`);
    this.consume();
    return null;
  }

  /** Parse variable declaration: type id = expr;  (handles comma-separated) */
  parseDeclaration() {
    const typeToken = this.consume(); // int, float, etc.
    const dataType = typeToken.value;
    const declarations = [];

    // Parse first declarator
    const firstDecl = this.parseDeclarator(dataType);
    if (firstDecl) declarations.push(firstDecl);

    // Parse additional comma-separated declarators
    while (this.match(',')) {
      this.consume(); // eat comma
      const decl = this.parseDeclarator(dataType);
      if (decl) declarations.push(decl);
    }

    this.expect(';');

    // Return single declaration or array
    return declarations.length === 1 ? declarations[0] : declarations;
  }

  /** Parse a single declarator: id or id = expr */
  parseDeclarator(dataType) {
    const id = this.peek();
    if (!id || id.type !== 'IDENTIFIER') {
      this.errors.push(`Expected identifier in '${dataType}' declaration`);
      return null;
    }
    this.consume();

    let init = null;
    if (this.match('=')) {
      this.consume(); // =
      init = this.parseExpression();
    }

    return {
      nodeType: 'Declaration',
      dataType,
      name: id.value,
      init
    };
  }

  /** Parse assignment: id = expr; or expression statement */
  parseAssignmentOrExpr() {
    const id = this.consume(); // identifier

    // Check for compound assignment operators
    const compoundOps = ['+=', '-=', '*=', '/='];
    if (this.peek() && compoundOps.includes(this.peek().value)) {
      const op = this.consume().value;
      const baseOp = op[0]; // + from +=
      const expr = this.parseExpression();
      this.expect(';');
      return {
        nodeType: 'Assignment',
        name: id.value,
        value: {
          nodeType: 'BinaryExpr',
          operator: baseOp,
          left: { nodeType: 'Identifier', name: id.value },
          right: expr
        }
      };
    }

    // ++ or -- 
    if (this.peek() && (this.peek().value === '++' || this.peek().value === '--')) {
      const op = this.consume().value;
      this.expect(';');
      return {
        nodeType: 'Assignment',
        name: id.value,
        value: {
          nodeType: 'BinaryExpr',
          operator: op === '++' ? '+' : '-',
          left: { nodeType: 'Identifier', name: id.value },
          right: { nodeType: 'Number', value: 1 }
        }
      };
    }

    if (this.match('=')) {
      this.consume(); // =
      const expr = this.parseExpression();
      this.expect(';');
      return {
        nodeType: 'Assignment',
        name: id.value,
        value: expr
      };
    }

    // Function call: id(args)
    if (this.match('(')) {
      this.consume();
      const args = this.parseArgList();
      this.expect(')');
      this.expect(';');
      return {
        nodeType: 'FunctionCall',
        name: id.value,
        args
      };
    }

    this.expect(';');
    return { nodeType: 'Identifier', name: id.value };
  }

  /** Parse do { ... } while (cond); */
  parseDoWhile() {
    this.expect('do');
    this.expect('{');
    const body = this.parseBody();
    this.expect('}');
    this.expect('while');
    this.expect('(');
    const condition = this.parseExpression();
    this.expect(')');
    this.expect(';');
    return {
      nodeType: 'DoWhile',
      condition,
      body
    };
  }

  /** Parse while (cond) { ... } */
  parseWhile() {
    this.expect('while');
    this.expect('(');
    const condition = this.parseExpression();
    this.expect(')');
    this.expect('{');
    const body = this.parseBody();
    this.expect('}');
    return {
      nodeType: 'While',
      condition,
      body
    };
  }

  /** Parse if (cond) { ... } else { ... } */
  parseIf() {
    this.expect('if');
    this.expect('(');
    const condition = this.parseExpression();
    this.expect(')');
    this.expect('{');
    const consequent = this.parseBody();
    this.expect('}');
    let alternate = null;
    if (this.match('else')) {
      this.consume();
      this.expect('{');
      alternate = this.parseBody();
      this.expect('}');
    }
    return {
      nodeType: 'If',
      condition,
      consequent,
      alternate
    };
  }

  /** Parse for (init; cond; update) { ... } */
  parseFor() {
    this.expect('for');
    this.expect('(');
    // init
    let init = null;
    if (!this.match(';')) {
      if (this.isTypeKeyword()) {
        init = this.parseDeclaration();
      } else {
        const id = this.consume();
        this.expect('=');
        const expr = this.parseExpression();
        this.expect(';');
        init = { nodeType: 'Assignment', name: id.value, value: expr };
      }
    } else {
      this.consume();
    }
    // condition
    let condition = null;
    if (!this.match(';')) {
      condition = this.parseExpression();
    }
    this.expect(';');
    // update
    let update = null;
    if (!this.match(')')) {
      const id = this.consume();
      if (this.peek() && this.peek().value === '++') {
        this.consume();
        update = { nodeType: 'Assignment', name: id.value, value: { nodeType: 'BinaryExpr', operator: '+', left: { nodeType: 'Identifier', name: id.value }, right: { nodeType: 'Number', value: 1 } } };
      } else if (this.peek() && this.peek().value === '--') {
        this.consume();
        update = { nodeType: 'Assignment', name: id.value, value: { nodeType: 'BinaryExpr', operator: '-', left: { nodeType: 'Identifier', name: id.value }, right: { nodeType: 'Number', value: 1 } } };
      } else if (this.match('=')) {
        this.consume();
        const expr = this.parseExpression();
        update = { nodeType: 'Assignment', name: id.value, value: expr };
      }
    }
    this.expect(')');
    this.expect('{');
    const body = this.parseBody();
    this.expect('}');
    return { nodeType: 'For', init, condition, update, body };
  }

  /** Parse printf/scanf("fmt", args); */
  parsePrintf() {
    const name = this.consume().value; // printf or scanf
    this.expect('(');
    const args = this.parseArgList();
    this.expect(')');
    this.expect(';');
    return {
      nodeType: 'FunctionCall',
      name,
      args
    };
  }

  /** Parse return expr; */
  parseReturn() {
    this.expect('return');
    let value = null;
    if (!this.match(';')) {
      value = this.parseExpression();
    }
    this.expect(';');
    return {
      nodeType: 'Return',
      value
    };
  }

  /** Parse comma-separated argument list */
  parseArgList() {
    const args = [];
    if (this.match(')')) return args;
    args.push(this.parseExpression());
    while (this.match(',')) {
      this.consume();
      args.push(this.parseExpression());
    }
    return args;
  }

  // ---- Expression parsing with precedence ----

  /** Expression → Comparison */
  parseExpression() {
    return this.parseComparison();
  }

  /** Comparison → Addition ( ( > | < | >= | <= | == | != ) Addition )* */
  parseComparison() {
    let left = this.parseAddition();
    while (this.peek() && ['>', '<', '>=', '<=', '==', '!='].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseAddition();
      left = { nodeType: 'BinaryExpr', operator: op, left, right };
    }
    return left;
  }

  /** Addition → Multiplication ( ( + | - ) Multiplication )* */
  parseAddition() {
    let left = this.parseMultiplication();
    while (this.peek() && ['+', '-'].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseMultiplication();
      left = { nodeType: 'BinaryExpr', operator: op, left, right };
    }
    return left;
  }

  /** Multiplication → Unary ( ( * | / | % ) Unary )* */
  parseMultiplication() {
    let left = this.parseUnary();
    while (this.peek() && ['*', '/', '%'].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseUnary();
      left = { nodeType: 'BinaryExpr', operator: op, left, right };
    }
    return left;
  }

  /** Unary → ( - | ! ) Unary | Primary */
  parseUnary() {
    if (this.peek() && (this.peek().value === '-' || this.peek().value === '!')) {
      const op = this.consume().value;
      const operand = this.parseUnary();
      return { nodeType: 'UnaryExpr', operator: op, operand };
    }
    return this.parsePrimary();
  }

  /** Primary → NUMBER | FLOAT | STRING | IDENTIFIER | ( expr ) | function call */
  parsePrimary() {
    const t = this.peek();
    if (!t) {
      this.errors.push('Unexpected end of input');
      return { nodeType: 'Error', message: 'Unexpected end of input' };
    }

    if (t.type === 'NUMBER') {
      this.consume();
      return { nodeType: 'Number', value: parseInt(t.value, 10) };
    }

    if (t.type === 'FLOAT_LITERAL') {
      this.consume();
      return { nodeType: 'Float', value: parseFloat(t.value) };
    }

    if (t.type === 'STRING') {
      this.consume();
      return { nodeType: 'String', value: t.value };
    }

    if (t.type === 'CHAR_LITERAL') {
      this.consume();
      return { nodeType: 'Char', value: t.value };
    }

    if (t.type === 'IDENTIFIER') {
      this.consume();
      // Check if it's a function call
      if (this.match('(')) {
        this.consume();
        const args = this.parseArgList();
        this.expect(')');
        return { nodeType: 'FunctionCall', name: t.value, args };
      }
      return { nodeType: 'Identifier', name: t.value };
    }

    if (t.value === '(') {
      this.consume();
      const expr = this.parseExpression();
      this.expect(')');
      return expr;
    }

    this.errors.push(`Unexpected token '${t.value}' at line ${t.line}`);
    this.consume();
    return { nodeType: 'Error', message: `Unexpected '${t.value}'` };
  }
}

/**
 * Build display-friendly tree from AST node.
 * Converts our internal AST into the JSON tree format requested.
 */
function buildDisplayTree(node) {
  if (!node) return null;

  switch (node.nodeType) {
    case 'BinaryExpr':
      return {
        type: node.operator,
        left: buildDisplayTree(node.left),
        right: buildDisplayTree(node.right)
      };
    case 'UnaryExpr':
      return {
        type: node.operator,
        operand: buildDisplayTree(node.operand)
      };
    case 'Number':
      return node.value;
    case 'Float':
      return node.value;
    case 'String':
      return node.value;
    case 'Identifier':
      return node.name;
    case 'Declaration':
      return {
        type: 'Declaration',
        dataType: node.dataType,
        name: node.name,
        init: node.init ? buildDisplayTree(node.init) : null
      };
    case 'Assignment':
      return {
        type: '=',
        left: node.name,
        right: buildDisplayTree(node.value)
      };
    case 'DoWhile':
      return {
        type: 'do-while',
        condition: buildDisplayTree(node.condition),
        body: node.body.map(buildDisplayTree)
      };
    case 'While':
      return {
        type: 'while',
        condition: buildDisplayTree(node.condition),
        body: node.body.map(buildDisplayTree)
      };
    case 'If':
      return {
        type: 'if',
        condition: buildDisplayTree(node.condition),
        consequent: node.consequent.map(buildDisplayTree),
        alternate: node.alternate ? node.alternate.map(buildDisplayTree) : null
      };
    case 'For':
      return {
        type: 'for',
        init: node.init ? buildDisplayTree(node.init) : null,
        condition: node.condition ? buildDisplayTree(node.condition) : null,
        update: node.update ? buildDisplayTree(node.update) : null,
        body: node.body.map(buildDisplayTree)
      };
    case 'FunctionCall':
      return {
        type: 'call',
        name: node.name,
        args: node.args.map(buildDisplayTree)
      };
    case 'Return':
      return {
        type: 'return',
        value: node.value ? buildDisplayTree(node.value) : null
      };
    default:
      return node;
  }
}

/**
 * Perform syntax analysis on the token stream.
 * @param {Array} tokens - Array of tokens from lexical analysis.
 * @returns {{ ast: Array, displayTrees: Array, errors: Array }}
 */
function syntaxAnalyze(tokens) {
  const parser = new Parser(tokens);
  const ast = parser.parseProgram();
  const displayTrees = ast.map(buildDisplayTree);

  return {
    ast,
    displayTrees,
    errors: parser.errors
  };
}

module.exports = { syntaxAnalyze };
