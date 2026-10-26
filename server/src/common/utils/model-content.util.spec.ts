import {
  parseDataUrl,
  parseImageDataUrl,
  parseToolArguments,
  stringifyContent,
} from './model-content.util';

declare const describe: any;
declare const expect: any;
declare const it: any;

const BASE64 = 'iVBORw0KGgo=';

describe('model-content.util', () => {
  describe('parseDataUrl', () => {
    it('解析 base64 dataUrl，MIME 统一小写并保留原始 dataUrl', () => {
      const dataUrl = `data:Application/PDF;base64,${BASE64}`;
      expect(parseDataUrl(dataUrl)).toEqual({
        mime: 'application/pdf',
        base64: BASE64,
        dataUrl,
      });
    });

    it('非字符串、非 base64、缺少 MIME 或含非法字符时返回 null', () => {
      expect(parseDataUrl(undefined)).toBeNull();
      expect(parseDataUrl({ url: `data:image/png;base64,${BASE64}` })).toBeNull();
      expect(parseDataUrl('https://example.com/a.png')).toBeNull();
      expect(parseDataUrl(`data:image/png,${BASE64}`)).toBeNull();
      expect(parseDataUrl('data:image/png;base64,ab c')).toBeNull();
      expect(parseDataUrl(`data:;base64,${BASE64}`)).toBeNull();
    });
  });

  describe('parseImageDataUrl', () => {
    it('只接受 image/* dataUrl，MIME 保留原样', () => {
      expect(parseImageDataUrl(`data:image/PNG;base64,${BASE64}`)).toEqual({
        mime: 'image/PNG',
        base64: BASE64,
      });
    });

    it('非图片 MIME、普通 URL 或非字符串返回 null', () => {
      expect(parseImageDataUrl(`data:application/pdf;base64,${BASE64}`)).toBeNull();
      expect(parseImageDataUrl('https://example.com/a.png')).toBeNull();
      expect(parseImageDataUrl(null)).toBeNull();
    });
  });

  describe('parseToolArguments', () => {
    it('把 JSON 对象字符串解析为参数对象', () => {
      expect(parseToolArguments('{"path":"a.txt","n":1}')).toEqual({ path: 'a.txt', n: 1 });
    });

    it('空串、空白、非字符串、非法 JSON、数组或标量一律返回空对象', () => {
      expect(parseToolArguments('')).toEqual({});
      expect(parseToolArguments('   ')).toEqual({});
      expect(parseToolArguments(undefined)).toEqual({});
      expect(parseToolArguments({ path: 'a.txt' })).toEqual({});
      expect(parseToolArguments('{not json')).toEqual({});
      expect(parseToolArguments('[1,2]')).toEqual({});
      expect(parseToolArguments('"text"')).toEqual({});
      expect(parseToolArguments('null')).toEqual({});
    });
  });

  describe('stringifyContent', () => {
    it('字符串原样返回，空值返回空串，其它标量 String 化', () => {
      expect(stringifyContent('hello')).toBe('hello');
      expect(stringifyContent('')).toBe('');
      expect(stringifyContent(null)).toBe('');
      expect(stringifyContent(undefined)).toBe('');
      expect(stringifyContent(42)).toBe('42');
    });

    it('content part 数组只保留文本并按行拼接，跳过空文本与非文本 part', () => {
      expect(
        stringifyContent([
          { type: 'text', text: '第一段' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${BASE64}` } },
          { text: '第二段' },
          { content: '第三段' },
          { type: 'text', text: '' },
          { type: 'text' },
        ]),
      ).toBe('第一段\n第二段\n第三段');
      expect(stringifyContent([])).toBe('');
    });
  });
});
