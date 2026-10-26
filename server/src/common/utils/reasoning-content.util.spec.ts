import { shouldKeepReasoningContentForModel } from './reasoning-content.util';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('reasoning-content.util', () => {
  it('keeps DeepSeek thinking compatibility unchanged', () => {
    expect(shouldKeepReasoningContentForModel('deepseek-r1')).toBe(true);
    expect(shouldKeepReasoningContentForModel('deepseek-chat')).toBe(false);
    expect(
      shouldKeepReasoningContentForModel('deepseek-chat', {
        thinking: { type: 'enabled' },
      }),
    ).toBe(true);
  });
});
