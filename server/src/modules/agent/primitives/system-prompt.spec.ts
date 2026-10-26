import { buildKernelSystemPrompt } from './system-prompt';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('default system prompt', () => {
  it('does not add clock-dependent text and preserves supplied capability sections', () => {
    jest.useFakeTimers();
    try {
      const section = 'Files for this turn: in/turn_example/input.csv';
      jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const first = buildKernelSystemPrompt({ sections: [undefined, '', section] });
      jest.setSystemTime(new Date('2030-06-01T12:34:56Z'));
      const later = buildKernelSystemPrompt({ sections: [section] });
      expect(later).toBe(first);
      expect(later).toContain(section);
      expect(buildKernelSystemPrompt()).not.toMatch(
        /current time|\d{4}-\d{2}-\d{2}|sandbox|container|当前时间|沙箱|容器/iu,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('tells the model that text alongside tool calls is a progress note and the answer comes last', () => {
    const prompt = buildKernelSystemPrompt();
    expect(prompt).toContain('shown to the user as a progress note');
    expect(prompt).toContain('complete answer in your final reply');
  });
});
