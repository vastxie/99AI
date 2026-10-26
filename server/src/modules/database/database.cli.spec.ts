import { DataSource } from 'typeorm';
import { databaseOptions, initializeEmptyDatabase, verifyDatabaseSchema } from './database-schema';
import { runDatabaseCli, runRequestedDatabaseCommand } from './database.cli';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;
declare const beforeEach: any;
declare const afterEach: any;

jest.mock('typeorm', () => ({ DataSource: jest.fn() }));
jest.mock('./database-schema', () => ({
  databaseOptions: jest.fn(),
  initializeEmptyDatabase: jest.fn(),
  verifyDatabaseSchema: jest.fn(),
}));

describe('database CLI without application startup', () => {
  let source: any;
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    source = {
      isInitialized: false,
      initialize: jest.fn(async () => {
        source.isInitialized = true;
      }),
      destroy: jest.fn(async () => {
        source.isInitialized = false;
      }),
    };
    (
      DataSource as unknown as { mockImplementation: (fn: () => unknown) => void }
    ).mockImplementation(() => source);
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(['db:init', 'db:check'])(
    'runs only the selected operation and closes its connection: %s',
    async (command: string) => {
      expect(await runDatabaseCli(command)).toBe(0);
      expect(initializeEmptyDatabase).toHaveBeenCalledTimes(command === 'db:init' ? 1 : 0);
      expect(verifyDatabaseSchema).toHaveBeenCalledTimes(command === 'db:check' ? 1 : 0);
      expect(source.destroy).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects a mistyped db command without constructing a connection', async () => {
    expect(await runRequestedDatabaseCommand('db:typo')).toBe(2);
    expect(DataSource).not.toHaveBeenCalled();
    expect(databaseOptions).not.toHaveBeenCalled();
  });
  it('continues ordinary bootstrap only when no database command was requested', async () => {
    expect(await runRequestedDatabaseCommand(undefined)).toBeUndefined();
    expect(await runRequestedDatabaseCommand('vertical:import')).toBeUndefined();
    expect(DataSource).not.toHaveBeenCalled();
    expect(await runRequestedDatabaseCommand('db:check')).toBe(0);
  });
  it.each(['options', 'initialize', 'operation', 'close'])(
    'returns a static error for %s failures',
    async (phase: string) => {
      const error = new Error('synthetic-private-database-detail');
      if (phase === 'options') (databaseOptions as any).mockRejectedValue(error);
      if (phase === 'initialize') source.initialize.mockRejectedValue(error);
      if (phase === 'operation') (verifyDatabaseSchema as any).mockRejectedValue(error);
      if (phase === 'close') source.destroy.mockRejectedValue(error);
      expect(await runDatabaseCli('db:check')).toBe(1);
      expect(process.stdout.write).not.toHaveBeenCalled();
      expect(JSON.stringify((process.stderr.write as any).mock.calls)).not.toContain(error.message);
      if (phase === 'operation' || phase === 'close')
        expect(source.destroy).toHaveBeenCalledTimes(1);
    },
  );
});
