/**
 * Express server for the Compiler Phase Visualizer.
 * Orchestrates all 6 compiler phases and exposes a single /compile endpoint.
 */

const express = require('express');
const cors = require('cors');

const { lexicalAnalyze } = require('./lexical');
const { syntaxAnalyze } = require('./syntax');
const { semanticAnalyze } = require('./semantic');
const { generateIntermediate } = require('./intermediate');
const { optimizeCode } = require('./optimizer');
const { generateTargetCode } = require('./codegen');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

/**
 * POST /compile
 * Body: { code: string }
 * Response: results of all 6 phases
 */
app.post('/compile', (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'No source code provided' });
    }

    // Phase 1: Lexical Analysis
    const lexResult = lexicalAnalyze(code);

    // Phase 2: Syntax Analysis
    const syntaxResult = syntaxAnalyze(lexResult.tokenStream);

    // Phase 3: Semantic Analysis
    const semanticResult = semanticAnalyze(syntaxResult.ast);

    // Phase 4: Intermediate Code Generation
    const intermediateResult = generateIntermediate(semanticResult.annotatedTrees);

    // Phase 5: Code Optimization
    const optimizationResult = optimizeCode(intermediateResult.code);

    // Phase 6: Target Code Generation
    const targetCode = generateTargetCode(optimizationResult.optimized);

    res.json({
      lexical: {
        tokenStream: lexResult.tokenStream,
        tokensByLine: lexResult.tokensByLine,
        tokenTable: lexResult.tokenTable,
        identifierMap: lexResult.identifierMap,
        symbolTable: lexResult.symbolTable,
        errors: lexResult.errors
      },
      syntax: {
        trees: syntaxResult.displayTrees,
        errors: syntaxResult.errors
      },
      semantic: {
        symbolTable: semanticResult.symbolTable,
        typeChecks: semanticResult.typeChecks,
        errors: semanticResult.errors
      },
      intermediate: {
        code: intermediateResult.code
      },
      optimized: {
        code: optimizationResult.optimized,
        applied: optimizationResult.applied
      },
      target: {
        code: targetCode
      }
    });
  } catch (err) {
    console.error('Compile error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Compiler Visualizer backend running on http://localhost:${PORT}`);
});
