type AnyFunction = (...args: any[]) => any;

export function createMockSocket(
  fn: () => AnyFunction,
  overrides: Record<string, any> = {},
): Record<string, any> {
  return {
    id: 'socket_1',
    data: { user: { id: 1 } },
    handshake: {
      headers: {},
      address: '127.0.0.1',
    },
    emit: fn(),
    join: fn(),
    disconnect: fn(),
    ...overrides,
  };
}
