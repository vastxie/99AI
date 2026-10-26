import { UserProfileSectionRegistry } from './user-profile-section.registry';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('UserProfileSectionRegistry', () => {
  const context = { userId: 1, rangeStart: null as Date | null, recentLimit: 5 };

  it('collects section data by id and merges their events', async () => {
    const registry = new UserProfileSectionRegistry();
    registry.register({
      id: 'alpha',
      build: async () => ({
        data: { a: 1 },
        events: [{ type: 'a', title: 'A', summary: '', occurredAt: '2026-01-01' }],
      }),
    });
    registry.register({ id: 'beta', build: async () => ({ data: { b: 2 } }) });
    registry.register({ id: 'empty', build: async () => null });

    const result = await registry.buildAll(context);
    expect(result.sections).toEqual({ alpha: { a: 1 }, beta: { b: 2 } });
    expect(result.events.map(event => event.type)).toEqual(['a']);
    expect(registry.ids()).toEqual(['alpha', 'beta', 'empty']);
  });

  it('skips a failing section without dropping the others', async () => {
    const registry = new UserProfileSectionRegistry();
    registry.register({
      id: 'broken',
      build: async () => {
        throw new Error('boom');
      },
    });
    registry.register({ id: 'ok', build: async () => ({ data: 'fine' }) });
    await expect(registry.buildAll(context)).resolves.toEqual({
      sections: { ok: 'fine' },
      events: [],
    });
  });

  it('rejects duplicate or unnamed sections', () => {
    const registry = new UserProfileSectionRegistry();
    registry.register({ id: 'x', build: async () => null });
    expect(() => registry.register({ id: 'x', build: async () => null })).toThrow('已注册');
    expect(() => registry.register({ id: '', build: async () => null })).toThrow('id');
  });
});
