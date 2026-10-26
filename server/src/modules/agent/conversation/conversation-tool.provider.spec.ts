import { FileRefMappingStore } from '../../fileAsset/file-refs';
import { getHistoricalToolModelContent } from '../../chatLog/context-history-projection';
import {
  createLayeredToolResult,
  getToolModelContent,
  toBackendToolCall,
  toFrontendToolCall,
} from '../../chatLog/tool-result-payload';
import { PRESENTATION_TOOL_RESULT_TYPE, QUESTION_TOOL_RESULT_TYPE } from '@99agent/contracts';
import { ConversationToolProvider, isConversationToolName } from './conversation-tool.provider';

declare const describe: any;
declare const expect: any;
declare const it: any;

const FILE_A = 'file_aaaaaaaaaaaaaaaaaaaaaaaa';
const FILE_B = 'file_bbbbbbbbbbbbbbbbbbbbbbbb';
const FILE_B2 = 'file_cccccccccccccccccccccccc';
const UPLOAD = 'file_dddddddddddddddddddddddd';

function storeWithOutputs(): FileRefMappingStore {
  const store = new FileRefMappingStore();
  store.registerFile(UPLOAD, { refKind: 'attachment', name: 'brief.docx' });
  store.registerFile(FILE_A, {
    refKind: 'output_file',
    name: 'process.py',
    mime: 'text/x-python',
    size: 120,
  });
  store.registerFile(FILE_B, { refKind: 'output_file', name: 'deck.pptx', size: 1000 });
  // 同名文件的新版本后登记
  store.registerFile(FILE_B2, { refKind: 'output_file', name: 'deck.pptx', size: 1200 });
  return store;
}

function contextWith(store?: FileRefMappingStore) {
  return {
    input: { messages: [], config: {}, context: { options: {} } },
    toolCallId: 'call_1',
    ...(store ? { fileRefMappingStore: store } : {}),
  } as any;
}

describe('ConversationToolProvider', () => {
  const provider = new ConversationToolProvider();

  it('declares only the two conversation tools', async () => {
    const names = (await provider.getToolDefinitions()).map(tool => tool.function.name);
    expect(names).toEqual(['present_files', 'ask_user']);
    expect(names.every(name => provider.canHandle(name) && isConversationToolName(name))).toBe(
      true,
    );
    expect(provider.canHandle('bash')).toBe(false);
    expect(isConversationToolName('mcp__crm__present_files')).toBe(false);
  });

  it('presents chosen output files in order with captions, latest version for a repeated name', async () => {
    const result: any = await provider.execute(
      'present_files',
      {
        files: [
          { file: 'out/turn_1/deck.pptx', caption: '路演终稿' },
          { file: 'output_file_1', caption: '' },
        ],
      },
      contextWith(storeWithOutputs()),
    );
    expect(result.status).toBe('success');
    expect(result.type).toBe(PRESENTATION_TOOL_RESULT_TYPE);
    expect(result.toolResult.assets.map((asset: any) => asset.fileId)).toEqual([FILE_B2, FILE_A]);
    expect(result.toolResult.assets.every((asset: any) => asset.role === 'final')).toBe(true);
    expect(result.toolResult.display.json.presentation).toEqual([
      { fileId: FILE_B2, caption: '路演终稿' },
      { fileId: FILE_A },
    ]);
    const modelContent = JSON.stringify(getToolModelContent(result));
    expect(modelContent).toContain('1. deck.pptx — 路演终稿');
    expect(modelContent).toContain('2. process.py');
  });

  it('refuses unknown files and user uploads, listing what can be presented', async () => {
    const result: any = await provider.execute(
      'present_files',
      { files: [{ file: 'brief.docx' }, { file: 'output_file_9' }] },
      contextWith(storeWithOutputs()),
    );
    expect(result.status).toBe('error');
    expect(result.type).toBe('tool');
    const text = JSON.stringify(result);
    expect(text).toContain('找不到这些文件：brief.docx、output_file_9');
    expect(text).toContain('output_file_3 deck.pptx');
    expect(text).not.toContain('attachment_1');
    expect(result.toolResult?.assets).toBeUndefined();
  });

  it('accepts an empty list as "no deliverables" and rejects oversized or malformed input', async () => {
    const store = storeWithOutputs();
    const none: any = await provider.execute('present_files', { files: [] }, contextWith(store));
    expect(none.status).toBe('success');
    expect(none.type).toBe(PRESENTATION_TOOL_RESULT_TYPE);
    expect(none.toolResult.display.json.presentation).toEqual([]);
    expect(none.toolResult.assets).toBeUndefined();
    expect(JSON.stringify(getToolModelContent(none))).toContain('没有要展示的成果文件');
    expect(
      (await provider.execute('present_files', { files: 'deck.pptx' }, contextWith(store))).status,
    ).toBe('error');
    const tooMany = Array.from({ length: 21 }, () => ({ file: 'deck.pptx' }));
    expect(
      (await provider.execute('present_files', { files: tooMany }, contextWith(store))).status,
    ).toBe('error');
    expect((await provider.execute('present_files', '{}', contextWith(store))).status).toBe(
      'error',
    );
    const noStore: any = await provider.execute(
      'present_files',
      { files: [{ file: 'deck.pptx' }] },
      contextWith(),
    );
    expect(JSON.stringify(noStore)).toContain('本对话还没有产出文件');
  });

  it('asks the user with options and asks the run to terminate', async () => {
    const result: any = await provider.execute(
      'ask_user',
      { question: '海报想要哪种风格？', options: ['科技感', ' 科技感 ', '', '手绘', null] },
      contextWith(),
    );
    expect(result.status).toBe('success');
    expect(result.type).toBe(QUESTION_TOOL_RESULT_TYPE);
    expect(result.toolResult.control).toEqual({ terminate: true });
    expect(result.toolResult.display.json.question).toEqual({
      text: '海报想要哪种风格？',
      options: ['科技感', '手绘'],
    });
    // 历史回放时参数为空，结果文本必须带上问题与选项
    const modelContent = JSON.stringify(getToolModelContent(result));
    expect(modelContent).toContain('海报想要哪种风格？');
    expect(modelContent).toContain('1. 科技感');
    expect(modelContent).toContain('2. 手绘');
  });

  it('treats a single or empty option list as a free-form question and validates the question', async () => {
    const single: any = await provider.execute(
      'ask_user',
      { question: '预算大概多少？', options: ['一万'] },
      contextWith(),
    );
    expect(single.toolResult.display.json.question.options).toEqual([]);
    expect(single.toolResult.control).toEqual({ terminate: true });
    const empty: any = await provider.execute('ask_user', { question: '  ' }, contextWith());
    expect(empty.status).toBe('error');
    expect(empty.toolResult?.control).toBeUndefined();
    const tooLong: any = await provider.execute(
      'ask_user',
      { question: 'x'.repeat(1001) },
      contextWith(),
    );
    expect(tooLong.status).toBe('error');
  });

  // 三条路径：本轮回灌、执行器二次包装后回灌、落库（JSON 往返）后的历史回放
  function modelTextPaths(result: any) {
    const rewrapped = createLayeredToolResult({
      id: result.id,
      type: result.type,
      toolName: result.toolName,
      displayName: result.displayName,
      name: result.name,
      status: result.status,
      input: {},
      rawOutput: result.output,
      time: 0,
      duration: 0,
      output: result.model?.output || result.display || result.output,
      toolResult: result.toolResult,
    });
    const executorResult = {
      ...rewrapped,
      model: result.model || rewrapped.model,
      toolResult: rewrapped.toolResult,
    };
    const stored = JSON.parse(JSON.stringify(toBackendToolCall(executorResult)));
    return {
      inTurn: getToolModelContent(result),
      afterExecutor: getToolModelContent(executorResult),
      history: getHistoricalToolModelContent(stored),
    };
  }

  it.each([
    [
      'present_files',
      { files: [{ file: 'output_file_3', caption: '路演终稿' }, { file: 'process.py' }] },
      '已向用户展示 2 个成果文件： 1. deck.pptx — 路演终稿 2. process.py',
    ],
    [
      'present_files',
      { files: [{ file: 'brief.docx' }] },
      '找不到这些文件：brief.docx。可展示的文件： - output_file_1 process.py - output_file_2 deck.pptx - output_file_3 deck.pptx',
    ],
    [
      'ask_user',
      { question: '海报想要哪种风格？', options: ['科技感', '手绘'] },
      '已向用户提问，本轮到此结束，等待用户回复。 问题：海报想要哪种风格？ 选项： 1. 科技感 2. 手绘',
    ],
    ['ask_user', { question: ' ' }, 'question 不能为空'],
  ])(
    'gives the model the plain result text of %s on every path',
    async (tool: string, args: any, expected: string) => {
      const result: any = await provider.execute(tool, args, contextWith(storeWithOutputs()));
      expect(modelTextPaths(result)).toEqual({
        inTurn: expected,
        afterExecutor: expected,
        history: expected,
      });
      // 给前端的投影不带模型文本
      const frontend = JSON.stringify(toFrontendToolCall(result));
      expect(frontend).not.toContain('modelContent');
      expect(frontend).not.toContain('文件解析摘要');
    },
  );
});
