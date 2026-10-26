export function createUnsafeToolCall(overrides: Record<string, any> = {}) {
  const base = {
    id: 'tool_1',
    name: 'tool',
    arguments: {
      url: 'https://api.example.com/file?token=SECRET_TOKEN',
    },
    output: {
      content: 'ok',
      stdout: 'STDOUT_SECRET',
      raw_output: 'RAW_SECRET',
      provider_response: 'PROVIDER_SECRET',
      details: [
        {
          title: 'result',
          url: 'https://api.example.com/item?api_key=SECRET_API_KEY',
          content: 'Authorization: Bearer SECRET_BEARER',
        },
      ],
    },
  };

  return {
    ...base,
    ...overrides,
    arguments: overrides.arguments || base.arguments,
    output: overrides.output || base.output,
  };
}
