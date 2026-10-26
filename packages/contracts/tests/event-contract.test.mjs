import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const contractsRoot = resolve(testDirectory, '..');
const serviceRequire = createRequire(new URL('../../../server/package.json', import.meta.url));
const ts = serviceRequire('typescript');
const packageJson = JSON.parse(readFileSync(join(contractsRoot, 'package.json'), 'utf8'));
const jsonFixture = JSON.parse(
  readFileSync(join(contractsRoot, 'fixtures/agent-events.json'), 'utf8'),
);
const reducerJsonFixture = JSON.parse(
  readFileSync(join(contractsRoot, 'fixtures/agent-event-reducer.json'), 'utf8'),
);

function formatDiagnostics(diagnostics) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => contractsRoot,
    getNewLine: () => '\n',
  });
}

function compileContracts() {
  const outDir = mkdtempSync(join(tmpdir(), '99agent-contracts-'));
  const rootNames = ts.sys.readDirectory(
    contractsRoot,
    ['.ts'],
    ['tests', 'node_modules'],
    ['src/**/*.ts', 'fixtures/**/*.ts'],
  );
  const program = ts.createProgram(rootNames, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    outDir,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, formatDiagnostics(diagnostics));
  const emitResult = program.emit();
  assert.equal(emitResult.emitSkipped, false, formatDiagnostics(emitResult.diagnostics));

  const indexSource = program.getSourceFile(join(contractsRoot, 'src/index.ts'));
  assert.ok(indexSource, 'contracts index source must be compiled');
  const indexSymbol = program.getTypeChecker().getSymbolAtLocation(indexSource);
  assert.ok(indexSymbol, 'contracts index module must have a symbol');

  return {
    outDir,
    indexExportNames: program
      .getTypeChecker()
      .getExportsOfModule(indexSymbol)
      .map((symbol) => symbol.name),
    runtime: serviceRequire(join(outDir, 'src/index.js')),
    kernelRuntime: serviceRequire(join(outDir, 'src/agent-events.js')),
    platformRuntime: serviceRequire(join(outDir, 'src/platform-events.js')),
    typedFixture: serviceRequire(join(outDir, 'fixtures/agent-events.fixture.js'))
      .AGENT_EVENT_FIXTURE,
  };
}

function compileSnippet(source) {
  const directory = mkdtempSync(join(tmpdir(), '99agent-contract-snippet-'));
  const fileName = join(directory, 'contract-check.ts');
  writeFileSync(fileName, source);
  const program = ts.createProgram([fileName], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  rmSync(directory, { recursive: true, force: true });
  return diagnostics;
}

function validateTaxonomy(allTypes, kernelTypes, platformTypes, fixtureTypes) {
  assert.equal(allTypes.length, 16);
  assert.equal(new Set(allTypes).size, 16);
  assert.deepEqual(fixtureTypes, allTypes);
  assert.deepEqual(platformTypes, ['billing.update', 'snapshot.sync']);
  assert.deepEqual(new Set([...kernelTypes, ...platformTypes]), new Set(allTypes));
}

const compiled = compileContracts();
test.after(() => rmSync(compiled.outDir, { recursive: true, force: true }));

test('public export surface exposes the exact package entries', () => {
  // 子路径导出（agent-events / envelope / platform-events / vertical-manifest）在三端零引用，
  // 公共面收紧为唯一的根入口；需要的类型都经 index.ts 再导出
  assert.deepEqual(Object.keys(packageJson.exports), ['.']);
  assert.ok(compiled.indexExportNames.includes('AGENT_EVENT_TYPES'));
  assert.ok(compiled.indexExportNames.includes('reduceAgentEvent'));
  assert.ok(compiled.indexExportNames.includes('VERTICAL_MANIFEST_VERSION'));
  const forbidden = new Set([
    'AssetRef',
    'ErrorCode',
    'Invocation',
    'Entitlement',
    'PluginHost',
    'Disposable',
  ]);
  assert.deepEqual(
    compiled.indexExportNames.filter((name) => forbidden.has(name)),
    [],
  );
});

test('runtime exports and the typed fixture define the same 16 event taxonomy', () => {
  const fixtureTypes = compiled.typedFixture.events.map((entry) => entry.event.type);
  validateTaxonomy(
    [...compiled.runtime.AGENT_EVENT_TYPES],
    [...compiled.kernelRuntime.AGENT_KERNEL_EVENT_TYPES],
    [...compiled.platformRuntime.PLATFORM_EVENT_TYPES],
    fixtureTypes,
  );

  assert.throws(() =>
    validateTaxonomy(
      [...compiled.runtime.AGENT_EVENT_TYPES, 'agent.drifted'],
      [...compiled.kernelRuntime.AGENT_KERNEL_EVENT_TYPES],
      [...compiled.platformRuntime.PLATFORM_EVENT_TYPES],
      fixtureTypes,
    ),
  );
});

test('TypeScript fixture is byte-equivalent to the cross-runtime JSON copy', () => {
  assert.equal(compiled.typedFixture.contractVersion, 1);
  assert.equal(JSON.stringify(compiled.typedFixture), JSON.stringify(jsonFixture));

  const start = compiled.typedFixture.events.find(
    (entry) => entry.event.type === 'agent.start',
  ).event;
  const snapshot = compiled.typedFixture.events.find(
    (entry) => entry.event.type === 'snapshot.sync',
  ).event;
  assert.equal(Object.hasOwn(start, 'seq'), false);
  assert.equal(snapshot.data.status, null);
  assert.equal(snapshot.workflowSeq, 17);
  assert.equal(snapshot.taskEventSeq, 5);
});

test('the compiler enforces required message content and the snapshot status type', () => {
  const importPath = JSON.stringify(join(contractsRoot, 'src/index'));
  const positive = compileSnippet(`
    import type { AgentEvent } from ${importPath};
    const event: AgentEvent = {
      type: "snapshot.sync",
      chatId: "cid",
      timestamp: 1,
      data: { status: null },
    };
    void event;
  `);
  assert.equal(positive.length, 0, formatDiagnostics(positive));

  const missingContent = compileSnippet(`
    import type { AgentEvent } from ${importPath};
    const event: AgentEvent = {
      type: "agent.start",
      chatId: "cid",
      timestamp: 1,
      data: { initialMessages: { user: { content: "ok" }, assistant: {} } },
    };
    void event;
  `);
  assert.equal(missingContent.length, 1, formatDiagnostics(missingContent));
  assert.equal(missingContent[0].code, 2741);
  assert.match(
    ts.flattenDiagnosticMessageText(missingContent[0].messageText, '\n'),
    /Property 'content' is missing.*required in type 'AgentInitialMessageWire'/,
  );

  const phaseWithoutRound = compileSnippet(`
    import type { AgentEvent } from ${importPath};
    const event: AgentEvent = {
      type: "message.phase",
      chatId: "cid",
      timestamp: 1,
      data: { phase: "process" },
    };
    void event;
  `);
  assert.equal(phaseWithoutRound.length, 1, formatDiagnostics(phaseWithoutRound));
  assert.match(ts.flattenDiagnosticMessageText(phaseWithoutRound[0].messageText, '\n'), /roundId/);
  const deltaWithoutRound = compileSnippet(`
    import type { AgentEvent } from ${importPath};
    const event: AgentEvent = {
      type: "message.delta",
      chatId: "cid",
      timestamp: 1,
      data: { delta: "ok" },
    };
    void event;
  `);
  assert.equal(deltaWithoutRound.length, 0, formatDiagnostics(deltaWithoutRound));

  const invalidSnapshotStatus = compileSnippet(`
    import type { SnapshotSyncEventData } from ${importPath};
    const data: SnapshotSyncEventData = { status: false };
    void data;
  `);
  assert.equal(invalidSnapshotStatus.length, 1, formatDiagnostics(invalidSnapshotStatus));
  assert.equal(invalidSnapshotStatus[0].code, 2322);
  assert.match(
    ts.flattenDiagnosticMessageText(invalidSnapshotStatus[0].messageText, '\n'),
    /Type 'false' is not assignable to type 'string.*number.*null.*undefined'/,
  );
});

test('fixtures contain only public safe projections', () => {
  const blockedKeys = new Set([
    'password',
    'secretKey',
    'accessToken',
    'baseUrl',
    'storagePath',
    'workspaceId',
    'leaseId',
    'provider',
    'runtime',
    'trace',
  ]);
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') {
      if (typeof value === 'string') assert.doesNotMatch(value, /https?:\/\//iu);
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      assert.equal(blockedKeys.has(key), false, `unsafe fixture key: ${key}`);
      visit(nested);
    }
  };
  visit(compiled.typedFixture.events);
  visit(reducerJsonFixture.cases);
});
