import test from 'node:test';
import assert from 'node:assert/strict';
import { runBoundaryChecks } from '../scripts/check-boundaries.mjs';

test('package boundary accepts the real zero-dependency acyclic source graph', () => {
  const result = runBoundaryChecks();
  assert.equal(result.recordOutcomeProductionCalls, 0);
});

const rejected = [
  ['bare framework import', "import { Logger } from '@nestjs/common';\n", /bare import/],
  ['uninjected time', 'export const value = new Date();\n', /uninjected capability Date/],
  [
    'platform type',
    'export interface Bad { context: ToolExecutionContext }\n',
    /forbidden platform identifier/,
  ],
  ['dynamic builtin name', "export const concrete = 'bash';\n", /concrete builtin name/],
  [
    'conversation control tool name',
    "export const concrete = 'ask_user';\n",
    /concrete builtin name/,
  ],
  [
    'recordOutcome activation',
    'export function bad(x: any) { x.recordOutcome(); }\n',
    /recordOutcome production calls/,
  ],
];

for (const [name, source, pattern] of rejected) {
  test(`boundary rejects ${name}`, () => {
    assert.throws(
      () =>
        runBoundaryChecks({
          compatibility: false,
          sourceOverrides: { 'negative.ts': source },
        }),
      pattern,
    );
  });
}

test('boundary rejects a source import cycle', () => {
  assert.throws(
    () =>
      runBoundaryChecks({
        compatibility: false,
        sourceOverrides: {
          'cycle-a.ts': "import './cycle-b';\n",
          'cycle-b.ts': "import './cycle-a';\n",
        },
      }),
    /source import cycle/,
  );
});

test('AST checks ignore comments and ordinary object property names', () => {
  assert.doesNotThrow(() =>
    runBoundaryChecks({
      compatibility: false,
      sourceOverrides: {
        'safe.ts': [
          '// openai_web_search and new Date() are documentation only',
          "export const metadata = { fileRef: 'not-a-concrete-tool' };",
        ].join('\n'),
      },
    }),
  );
});
