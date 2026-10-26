import { safeDownloadToBuffer } from '@/common/utils/safe-download.util';
import { downloadAndDecryptMedia, encryptAesEcb } from './weixin-media';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

jest.mock('@/common/utils/safe-download.util', () => ({
  safeDownloadToBuffer: jest.fn(),
}));

describe('weixin-media downloadAndDecryptMedia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('downloads encrypted media through safeDownloadToBuffer before decrypting', async () => {
    const key = Buffer.from('0123456789abcdef');
    const plaintext = Buffer.from('voice payload');
    const encrypted = encryptAesEcb(plaintext, key);

    (safeDownloadToBuffer as any).mockResolvedValue({
      buffer: encrypted,
      contentType: 'application/octet-stream',
      finalUrl: 'https://example.com/media',
      headers: {},
      statusCode: 200,
    });

    const decrypted = await downloadAndDecryptMedia(
      'encrypted-param',
      key.toString('base64'),
      'https://example.com/media',
    );

    expect(safeDownloadToBuffer).toHaveBeenCalledWith('https://example.com/media', {
      blockPrivateNetwork: true,
      maxBytes: 100 * 1024 * 1024,
      timeoutMs: 30000,
    });
    expect(decrypted.toString('hex')).toBe(plaintext.toString('hex'));
  });
});
