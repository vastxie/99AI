import { OutputCollector } from '../../sandbox/exec-support';
import {
  codePointLength,
  fileRefLinesReserve,
  fitHeadTail,
  fitLinesFromStart,
  PRIMITIVE_BODY_BUDGET,
  primitiveBodyBudget,
  splitCaptureNote,
  splitLines,
} from './model-text-budget';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('primitive model text budget', () => {
  it('gives the body at most 8,000 and reserves the frame and file reference lines first', () => {
    expect(primitiveBodyBudget(100)).toBe(PRIMITIVE_BODY_BUDGET);
    expect(primitiveBodyBudget(3_000, 5_000)).toBe(12_000 - 3_000 - 5_000 - 100);
    expect(primitiveBodyBudget(12_000)).toBe(0);
  });

  it('reserves file reference lines by the full names, for at most 20 files', () => {
    expect(fileRefLinesReserve([])).toBe(0);
    const short = fileRefLinesReserve([{ name: 'a.csv', mime: 'text/csv' }]);
    const long = fileRefLinesReserve([{ name: 'x'.repeat(255), mime: 'text/csv' }]);
    expect(long - short).toBe(250);
    const many = Array.from({ length: 30 }, () => ({ name: 'y'.repeat(40), mime: 'text/plain' }));
    expect(fileRefLinesReserve(many)).toBe(fileRefLinesReserve(many.slice(0, 20)) + 30);
  });

  it('splits off the capture note the sandbox appends when it truncates output', () => {
    const collector = new OutputCollector(10);
    collector.push('abcdefghijklmnop');
    expect(splitCaptureNote(collector.toString())).toEqual({
      text: 'abcdefghij',
      capturedBytes: 10,
    });
    expect(splitCaptureNote('plain\n')).toEqual({ text: 'plain\n' });
  });

  it('counts code points like Python string indexes', () => {
    expect(codePointLength('ab😀中')).toBe(4);
  });

  it('splits lines without counting the final newline as an extra line', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b']);
    expect(splitLines('a\r\nb')).toEqual(['a\r', 'b']);
    expect(splitLines('')).toEqual(['']);
  });

  it('keeps whole lines from the start and only cuts a first line that alone is too long', () => {
    const lines = ['alpha', 'beta', 'gamma'];
    expect(fitLinesFromStart(lines, 10)).toEqual({ text: 'alpha\nbeta', count: 2 });
    expect(fitLinesFromStart(lines, 100)).toEqual({ text: 'alpha\nbeta\ngamma', count: 3 });
    expect(fitLinesFromStart(['x'.repeat(50)], 20)).toEqual({
      text: 'x'.repeat(20),
      count: 0,
      partial: { shown: 20, total: 50 },
    });
    // 不切断代理对
    expect(fitLinesFromStart(['ab😀cd'], 3)).toEqual({
      text: 'ab',
      count: 0,
      partial: { shown: 2, total: 6 },
    });
  });

  it('keeps the head and the larger tail of command output by whole lines', () => {
    const text = Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`).join('\n');
    const fitted = fitHeadTail(text, 2000);
    expect(fitted.length).toBeLessThanOrEqual(2000);
    expect(fitted.startsWith('line 1\nline 2\n')).toBe(true);
    expect(fitted.endsWith('line 999\nline 1000')).toBe(true);
    expect(fitted).toMatch(/…\[省略已捕获输出的第 \d+–\d+ 行，共 1000 行\]…/);
    const [head, tail] = fitted.split(/\n…\[省略.*\]…\n/);
    expect(tail.length).toBeGreaterThan(head.length * 2);
    expect(fitHeadTail('short', 2000)).toBe('short');
  });

  it('falls back to characters when a single line is too long', () => {
    const text = `${'a'.repeat(5000)}${'z'.repeat(5000)}`;
    const fitted = fitHeadTail(text, 1000);
    expect(fitted.length).toBeLessThanOrEqual(1000);
    expect(fitted.startsWith('a')).toBe(true);
    expect(fitted.endsWith('z')).toBe(true);
    expect(fitted).toContain('省略已捕获输出中间约');
  });
});
