import {
  assertAgentToolResult,
  isAgentToolResult,
  normalizeToolResult,
} from './agent-tool-result.types';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('AgentToolResult contract', () => {
  it('accepts private media references and rejects raw data smuggled beside a reference', () => {
    const part = { type: 'image_file', file: { fileRef: 'output_image_1', mime: 'image/png' } };
    expect(normalizeToolResult({ status: 'success', modelContent: [part] }).modelContent).toEqual([
      part,
    ]);
    for (const unsafe of [
      { ...part, data: 'RAW' },
      { ...part, file: { ...part.file, data: 'RAW' } },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ]) {
      expect(() => assertAgentToolResult({ status: 'success', modelContent: [unsafe] })).toThrow();
    }
  });
  it('keeps model, display, assets, trace, and control in separate layers', () => {
    const result = {
      status: 'success',
      modelContent: '模型只读取这里的搜索摘要。',
      display: {
        title: '搜索完成',
        summary: '找到 3 条结果',
        markdown: '- 结果 A',
      },
      assets: [
        {
          fileId: 'file_report_1',
          role: 'final',
          displayName: 'report.md',
          mimeType: 'text/markdown',
          size: 128,
        },
      ],
      trace: {
        code: 'OK',
        message: '工具已完成',
        retryable: false,
        diagnostics: {
          warningCodes: ['TRUNCATED'],
        },
      },
      control: {
        terminate: false,
        queueNextTurn: false,
      },
    };

    assertAgentToolResult(result);

    expect(isAgentToolResult(result)).toBe(true);
    expect(result.display).not.toHaveProperty('modelContent');
    expect(result.assets[0]).not.toHaveProperty('url');
    expect(JSON.stringify(result)).not.toContain('/Users/');
  });

  it('rejects sensitive public display, asset, and trace fields', () => {
    expect(() =>
      assertAgentToolResult({
        status: 'error',
        modelContent: '模型可见错误摘要',
        display: {
          summary: '失败',
          rawOutput: 'RAW_SECRET',
        },
      }),
    ).toThrow(/rawOutput/);

    expect(() =>
      assertAgentToolResult({
        status: 'success',
        assets: [
          {
            fileId: 'file_result_1',
            role: 'final',
            displayName: 'result.txt',
            localPath: '/Users/example/private/result.txt',
          },
        ],
      }),
    ).toThrow(/localPath/);

    expect(() =>
      assertAgentToolResult({
        status: 'error',
        trace: {
          message: '失败',
          stderr: 'STDERR_SECRET',
        },
      }),
    ).toThrow(/stderr/);
  });

  it('rejects sensitive strings in public display, assets, and trace layers', () => {
    const baseResult = {
      status: 'success',
    };

    expect(() =>
      assertAgentToolResult({
        ...baseResult,
        display: {
          summary: 'apiKey=SECRET_VALUE',
        },
      }),
    ).toThrow(/display\.summary/);

    expect(() =>
      assertAgentToolResult({
        ...baseResult,
        display: {
          markdown: 'baseUrl: https://provider.example.com',
          json: {
            note: 'provider raw payload: {"id":"raw"}',
          },
        },
      }),
    ).toThrow(/display\.markdown|display\.json\.note/);

    expect(() =>
      assertAgentToolResult({
        ...baseResult,
        assets: [
          {
            fileId: 'file_result_1',
            role: 'final',
            displayName: '/Users/example/private/result.txt',
          },
        ],
      }),
    ).toThrow(/assets\[0\]\.displayName/);

    expect(() =>
      assertAgentToolResult({
        ...baseResult,
        trace: {
          message: 'stdout: secret output',
          diagnostics: {
            error: 'stack: Error\n    at run (/Users/example/app.ts:1:1)',
          },
        },
      }),
    ).toThrow(/trace\.message|trace\.diagnostics\.error/);

    expect(() =>
      assertAgentToolResult({
        ...baseResult,
        trace: {
          message: 'trace: Error at provider call',
        },
      }),
    ).toThrow(/trace\.message/);
  });

  it('rejects malformed assets and unsupported statuses', () => {
    expect(isAgentToolResult({ status: 'loading' })).toBe(false);
    expect(
      isAgentToolResult({
        status: 'success',
        assets: [
          {
            fileId: '/tmp/result.txt',
            role: 'final',
            displayName: 'result.txt',
          },
        ],
      }),
    ).toBe(false);
  });

  it('sanitizes current result fields without exposing provider fields', () => {
    const result = normalizeToolResult(
      {
        status: 'success',
        modelContent: '模型可读摘要 stdout: private runtime log',
        assets: [
          {
            fileId: 'file_pdf_1',
            displayName: 'report.pdf',
            role: 'final',
            mimeType: 'application/pdf',
            size: 2048,
            downloadUrl: '/api/files/file_pdf_1/download',
          },
        ],
        stdout: 'runtime secret',
        providerPayload: { apiKey: 'SECRET' },
        baseUrl: 'https://provider.example.com',
      },
      {
        display: {
          summary: 'PDF 已生成。',
        },
      },
    );

    assertAgentToolResult(result);
    expect(result.status).toBe('success');
    expect(result.display?.summary).toBe('PDF 已生成。');
    expect(result.assets).toEqual([
      {
        fileId: 'file_pdf_1',
        role: 'final',
        displayName: 'report.pdf',
        mimeType: 'application/pdf',
        size: 2048,
      },
    ]);
    const publicSerialized = JSON.stringify({
      display: result.display,
      assets: result.assets,
      trace: result.trace,
    });
    expect(publicSerialized).not.toContain('stdout');
    expect(publicSerialized).not.toContain('providerPayload');
    expect(publicSerialized).not.toContain('baseUrl');
    expect(publicSerialized).not.toContain('/api/files/file_pdf_1/download');
  });

  it('accepts the current result shape and rejects raw error objects', () => {
    const alreadyNormalized = normalizeToolResult({
      status: 'success',
      modelContent: '模型继续推理文本',
      display: { summary: '展示摘要' },
    });
    expect(alreadyNormalized).not.toHaveProperty('version');
    expect(alreadyNormalized.modelContent).toBe('模型继续推理文本');

    expect(() => normalizeToolResult(new Error('synthetic failure'), { status: 'error' })).toThrow(
      'result must be an object',
    );
    expect(() => normalizeToolResult({ content: 'old shape' })).toThrow('invalid status');
    const error = normalizeToolResult({
      status: 'error',
      trace: { code: 'TOOL_ERROR', message: 'provider raw payload: SECRET' },
    });
    expect(error.status).toBe('error');
    expect(error.trace?.message).toContain('[已脱敏]');
    expect(JSON.stringify(error.trace)).not.toContain('SECRET');
  });
});
