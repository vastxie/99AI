import { ModelGatewayMediaPreparerService } from './model-gateway-media-preparer.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ModelGatewayMediaPreparerService', () => {
  it('materializes internal fileRef parts only at model gateway boundary', async () => {
    const fileAssetService = {
      findByFileIdForAccess: jest
        .fn()
        .mockResolvedValue({ fileId: 'file_abcdefghijklmnopqrstuvwx' }),
      assertAccessible: jest.fn(),
    };
    const fileMaterializerService = {
      materializeImageForModel: jest.fn().mockResolvedValue({
        dataUrl: 'data:image/png;base64,aW1hZ2U=',
        mime: 'image/png',
        size: 5,
        sourceType: 'file_id',
      }),
      materializeFileForService: jest.fn().mockResolvedValue({
        buffer: Buffer.from('%PDF-1.7\n'),
        name: 'report.pdf',
        mime: 'application/pdf',
        size: 9,
        sourceType: 'file_id',
      }),
    };
    const service = new ModelGatewayMediaPreparerService(
      fileAssetService as any,
      fileMaterializerService as any,
    );

    const prepared = await service.prepare({
      config: {
        protocol: 'demo_generate',
        model: 'gemini-test',
        apiKey: 'key',
        baseUrl: 'https://example.com',
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '看文件' },
            { type: 'image_file', file: { fileRef: 'attachment_1', name: 'a.png' } },
            { type: 'document_file', file: { fileRef: 'attachment_2', name: 'report.pdf' } },
          ],
        },
      ],
      purpose: 'agent_loop',
      fileContext: {
        actor: { id: 7, role: 'user' },
        fileRefMapping: {
          entries: [
            { fileRef: 'attachment_1', fileId: 'file_abcdefghijklmnopqrstuvwx' },
            { fileRef: 'attachment_2', fileId: 'file_abcdefghijklmnopqrstuvwx' },
          ],
          counters: { attachment: 2, output_image: 0, output_file: 0, previous_file: 0 },
        },
      },
    } as any);

    expect(prepared.messages[0].content).toEqual([
      { type: 'text', text: '看文件' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
      {
        type: 'document',
        document: {
          data: 'data:application/pdf;base64,JVBERi0xLjcK',
          mime: 'application/pdf',
          name: 'report.pdf',
        },
      },
    ]);
    expect(fileAssetService.findByFileIdForAccess).toHaveBeenCalledWith(
      'file_abcdefghijklmnopqrstuvwx',
    );
    expect(fileMaterializerService.materializeImageForModel).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'file_abcdefghijklmnopqrstuvwx' }),
    );
    expect(JSON.stringify(prepared.messages)).not.toContain('attachment_1');
    expect(JSON.stringify(prepared.messages)).not.toContain('file_abcdefghijklmnopqrstuvwx');
  });

  it('rejects non-PDF document_file parts before reaching provider adapters', async () => {
    const fileAssetService = {
      findByFileIdForAccess: jest
        .fn()
        .mockResolvedValue({ fileId: 'file_abcdefghijklmnopqrstuvwx' }),
      assertAccessible: jest.fn(),
    };
    const fileMaterializerService = {
      materializeImageForModel: jest.fn(),
      materializeFileForService: jest.fn().mockResolvedValue({
        buffer: Buffer.from('not a pdf'),
        name: 'report.pdf',
        mime: 'application/pdf',
        size: 9,
        sourceType: 'file_id',
      }),
    };
    const service = new ModelGatewayMediaPreparerService(
      fileAssetService as any,
      fileMaterializerService as any,
    );

    await expect(
      service.prepare({
        config: {
          protocol: 'demo_responses',
          model: 'doubao-test',
          apiKey: 'key',
          baseUrl: 'https://example.com',
        },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: '看文件' },
              { type: 'document_file', file: { fileRef: 'attachment_1', name: 'report.pdf' } },
            ],
          },
        ],
        purpose: 'agent_loop',
        fileContext: {
          actor: { id: 7, role: 'user' },
          fileRefMapping: {
            entries: [{ fileRef: 'attachment_1', fileId: 'file_abcdefghijklmnopqrstuvwx' }],
            counters: { attachment: 1, output_image: 0, output_file: 0, previous_file: 0 },
          },
        },
      } as any),
    ).rejects.toThrow('仅支持 PDF 文件直读');
  });
});
