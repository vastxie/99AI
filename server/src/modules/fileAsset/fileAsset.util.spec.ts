import { resolveFileDeliveryHeaders } from './fileAsset.util';
import { sanitizeRuntimeFileName } from './fileAsset.util';

declare const describe: any;
declare const expect: any;
declare const it: any;

// 与 fileAsset.util.ts 的 MAX_RUNTIME_FILENAME_BYTES 保持一致（推导见该常量注释：
// 255 字节路径分量 - "10-" 前缀，收敛到与 MAX_ARTIFACT_NAME_BYTES 相等的 192）。
const MAX_FILENAME_BYTES = 192;

describe('sanitizeRuntimeFileName', () => {
  it('keeps names within the UTF-8 byte budget unchanged', () => {
    const chinese = `${'会'.repeat(62)}.docx`; // 62 * 3 + 5 = 191 bytes
    expect(sanitizeRuntimeFileName('report.pdf')).toBe('report.pdf');
    expect(sanitizeRuntimeFileName(chinese)).toBe(chinese);
  });

  it('truncates by UTF-8 bytes, not UTF-16 code units, and keeps the extension', () => {
    // 100 chars = 300 bytes: under the old 180-code-unit cap this passed through
    // untruncated and later failed the 255-byte workspace path component check.
    const result = sanitizeRuntimeFileName(`${'会'.repeat(100)}.docx`);
    expect(result).toBe(`${'会'.repeat(62)}.docx`);
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(MAX_FILENAME_BYTES);
  });

  it('never splits a multi-byte character at the byte boundary', () => {
    // Budget 192 - 4 (".pdf") = 188 bytes; 62 CJK chars = 186 bytes, so the
    // 63rd char (which would end at 189) must be dropped whole.
    const result = sanitizeRuntimeFileName(`${'数'.repeat(90)}.pdf`);
    expect(result).toBe(`${'数'.repeat(62)}.pdf`);
    expect(Buffer.from(result, 'utf8').toString('utf8')).toBe(result);
  });

  it('truncates long ASCII names with the extension preserved', () => {
    expect(sanitizeRuntimeFileName(`${'a'.repeat(200)}.txt`)).toBe(`${'a'.repeat(188)}.txt`);
  });

  it('always fits the worst-case workspace path component', () => {
    // python-workspace builds `calls/<24hex>/<index>-<name>` with index <= 10;
    // the component limit is 255 UTF-8 bytes on both Service and Runtime.
    for (const raw of [
      `${'会'.repeat(120)}.docx`,
      `${'x'.repeat(400)}.tar.gz`,
      '会议纪要'.repeat(60),
    ]) {
      const component = `10-${sanitizeRuntimeFileName(raw)}`;
      expect(Buffer.byteLength(component, 'utf8')).toBeLessThanOrEqual(255);
    }
  });

  it('drops an oversized pseudo-extension instead of preserving it', () => {
    const result = sanitizeRuntimeFileName(`name.${'e'.repeat(200)}`);
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(MAX_FILENAME_BYTES);
    expect(result.startsWith('name.')).toBe(true);
  });

  it('keeps the safe fallback for empty and traversal-shaped names', () => {
    expect(sanitizeRuntimeFileName('')).toBe('runtime-output.bin');
    expect(sanitizeRuntimeFileName('..')).toBe('runtime-output.bin');
    expect(sanitizeRuntimeFileName('../..')).toBe('runtime-output.bin');
  });
});

describe('resolveFileDeliveryHeaders', () => {
  it('forces scriptable types to download as octet-stream with a sandbox CSP', () => {
    for (const input of [
      { mime: 'text/xml', name: 'a.xml', ext: 'xml' },
      { mime: 'image/png', name: 'a.svg', ext: 'svg' },
      { mime: 'text/html', name: 'a.txt', ext: 'txt' },
      { mime: 'application/xhtml+xml', name: 'a.bin', ext: 'bin' },
      { mime: 'image/svg+xml', name: 'logo', ext: '' },
    ]) {
      expect(resolveFileDeliveryHeaders({ ...input, disposition: 'inline' })).toEqual({
        contentType: 'application/octet-stream',
        disposition: 'attachment',
        contentSecurityPolicy: "default-src 'none'; sandbox",
      });
    }
  });

  it('keeps media and pdf inline, turns other inline requests into downloads', () => {
    expect(
      resolveFileDeliveryHeaders({
        mime: 'image/png',
        name: 'a.png',
        ext: 'png',
        disposition: 'inline',
      }),
    ).toEqual({ contentType: 'image/png', disposition: 'inline' });
    expect(
      resolveFileDeliveryHeaders({
        mime: 'application/pdf',
        name: 'a.pdf',
        ext: 'pdf',
        disposition: 'inline',
      }),
    ).toEqual({ contentType: 'application/pdf', disposition: 'inline' });
    expect(
      resolveFileDeliveryHeaders({
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        name: 'a.docx',
        ext: 'docx',
        disposition: 'inline',
      }),
    ).toEqual({
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      disposition: 'attachment',
    });
  });

  it('adds a sandbox CSP to inline text and keeps downloads untouched', () => {
    expect(
      resolveFileDeliveryHeaders({
        mime: 'text/plain',
        name: 'a.txt',
        ext: 'txt',
        disposition: 'inline',
      }),
    ).toEqual({
      contentType: 'text/plain',
      disposition: 'inline',
      contentSecurityPolicy: "default-src 'none'; sandbox",
    });
    expect(
      resolveFileDeliveryHeaders({
        mime: 'text/plain',
        name: 'a.txt',
        ext: 'txt',
        disposition: 'attachment',
      }),
    ).toEqual({ contentType: 'text/plain', disposition: 'attachment' });
    expect(
      resolveFileDeliveryHeaders({ mime: '', name: 'blob', ext: '', disposition: 'attachment' }),
    ).toEqual({ contentType: 'application/octet-stream', disposition: 'attachment' });
  });
});
