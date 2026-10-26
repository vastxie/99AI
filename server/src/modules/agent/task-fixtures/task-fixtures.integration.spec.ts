import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Workbook } from 'exceljs';
import { createFileAssetMemoryFixture } from '../../../test/fixtures/file-asset-memory.fixture';
import { LocalSandboxDriver } from '../../sandbox/local-sandbox.driver';
import { SandboxService, readSandboxPolicyFromEnv } from '../../sandbox/sandbox.service';
import { FileRefMappingStore } from '../../fileAsset/file-refs';
import { PrimitiveToolProvider } from '../primitives/primitive-tool.provider';
import { toFrontendToolCall } from '../../chatLog/tool-result-payload';
import type { ToolExecutionContext } from '../tools/tool-provider.interface';

// sharp 0.35 的顶层 types 指向 ESM 声明（默认导出），service 按 CommonJS 解析：运行时 require 返回的就是函数本身
const sharp: typeof import('sharp').default = require('sharp');

declare const describe: any;
declare const it: any;
declare const expect: any;

// Python standard library only: the same primitive bash path creates all three real formats.
const GENERATE = `import csv, os, struct, zlib, zipfile
from pathlib import Path
from xml.sax.saxutils import escape
out = Path(os.environ['AGENT_OUTPUT_DIR'])
rows = [('Alpha', 12), ('Beta', 28), ('Gamma', 20)]
with (out / 'sales.csv').open('w', newline='', encoding='utf-8') as stream:
    writer = csv.writer(stream)
    writer.writerow(['Product', 'Sales'])
    writer.writerows(rows)
width, height = 120, 80
pixels = bytearray([255] * (width * height * 3))
for index, (_, value) in enumerate(rows):
    for y in range(height - 10 - value * 2, height - 10):
        for x in range(10 + index * 35, 30 + index * 35):
            offset = (y * width + x) * 3
            pixels[offset:offset + 3] = bytes([40, 100, 180])
def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
scanlines = b''.join(b'\\0' + pixels[y * width * 3:(y + 1) * width * 3] for y in range(height))
png = b'\\x89PNG\\r\\n\\x1a\\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(scanlines)) + chunk(b'IEND', b'')
(out / 'sales.png').write_bytes(png)
ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
def paragraph(text):
    return '<w:p><w:r><w:t>' + escape(text) + '</w:t></w:r></w:p>'
table = '<w:tbl>' + ''.join('<w:tr>' + ''.join('<w:tc>' + paragraph(str(cell)) + '</w:tc>' for cell in row) + '</w:tr>' for row in [('Product', 'Sales')] + rows) + '</w:tbl>'
document = '<w:document xmlns:w="' + ns + '"><w:body>' + paragraph('Sales report') + paragraph('Total sales: 60') + table + '<w:sectPr/></w:body></w:document>'
with zipfile.ZipFile(out / 'sales.docx', 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    archive.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    archive.writestr('word/document.xml', document)
print('Created sales table, chart and document')`;

describe('offline artifact task samples', () => {
  it('creates, opens and checks the CSV, PNG and DOCX deliverables through the actual primitive path', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'agent-task-fixture-'));
    const sandbox = new SandboxService(
      new LocalSandboxDriver(root),
      undefined,
      undefined,
      readSandboxPolicyFromEnv({}),
      0,
    );
    const { files, objects, rows } = createFileAssetMemoryFixture();
    const provider = new PrimitiveToolProvider(sandbox, files);
    const options = {
      userId: 7,
      conversationId: 11,
      messageId: 'message_tasks',
      turnId: 'turn_tasks',
    };
    const context: ToolExecutionContext = {
      toolCallId: 'call_tasks',
      fileRefMappingStore: new FileRefMappingStore(),
      input: { messages: [], config: {}, context: { options } },
    };
    try {
      await provider.prepareTurn(context);
      const result = await provider.execute(
        'bash',
        { command: `/usr/bin/python3 -I - <<'PY'\n${GENERATE}\nPY` },
        context,
      );
      expect(result.status).toBe('success');
      const frontend = toFrontendToolCall(result);
      expect(frontend.assets).toHaveLength(3);
      expect(frontend.assets.every((asset: { role?: string }) => asset.role === 'final')).toBe(
        true,
      );
      expect(frontend).not.toHaveProperty('result');
      expect(JSON.stringify(frontend)).not.toContain(root);
      const assetByName = new Map(
        [...rows.values()].filter(row => row.origin !== 'sandbox_turn').map(row => [row.name, row]),
      );
      expect([...assetByName.keys()].sort()).toEqual(['sales.csv', 'sales.docx', 'sales.png']);
      for (const asset of assetByName.values()) {
        expect(asset.status).toBe('active');
        expect(asset.turnId).toBe('turn_tasks');
        expect(asset.visibility).toBe('private');
        await expect(files.findActiveForDownload(asset.fileId, { id: 7 })).resolves.toMatchObject({
          fileId: asset.fileId,
        });
        await expect(files.findActiveForDownload(asset.fileId, { id: 8 })).rejects.toThrow();
      }
      const csv = objects.get(assetByName.get('sales.csv')!.objectKey)!;
      const sheet = await new Workbook().csv.read(Readable.from([csv]));
      expect(sheet.getRow(1).values).toEqual([undefined, 'Product', 'Sales']);
      expect([2, 3, 4].map(row => sheet.getCell(row, 2).value)).toEqual([12, 28, 20]);
      expect([2, 3, 4].reduce((sum, row) => sum + Number(sheet.getCell(row, 2).value), 0)).toBe(60);
      const png = objects.get(assetByName.get('sales.png')!.objectKey)!;
      const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, info.channels]).toEqual([120, 80, 3]);
      const pixel = (x: number, y: number) => [
        ...data.subarray((y * 120 + x) * 3, (y * 120 + x) * 3 + 3),
      ];
      expect(pixel(15, 50)).toEqual([40, 100, 180]);
      expect(pixel(15, 30)).toEqual([255, 255, 255]);
      expect(pixel(50, 30)).toEqual([40, 100, 180]);
      // 登录用户整机一台：沙箱归属是用户，交付登记按对话区分
      const recovered = await provider.captureArtifacts(
        {
          ownerId: 'user-7',
          sessionId: 'user-7:conversation:11',
          conversationId: '11',
          userId: 7,
        },
        options,
      );
      expect(new Set(recovered.map(asset => asset.fileId)).size).toBe(3);
      const document = objects.get(assetByName.get('sales.docx')!.objectKey)!;
      await sandbox.writeFile('user-7', 'work/verify.docx', document);
      const checked = await sandbox.exec(
        'user-7',
        `/usr/bin/python3 -I - <<'PY'\nimport zipfile, xml.etree.ElementTree as ET\nwith zipfile.ZipFile('work/verify.docx') as archive:\n    assert archive.testzip() is None\n    document = ET.fromstring(archive.read('word/document.xml'))\n    ET.fromstring(archive.read('[Content_Types].xml'))\n    relationships = ET.fromstring(archive.read('_rels/.rels'))\n    assert relationships[0].attrib['Target'] == 'word/document.xml'\n    text = list(document.itertext())\n    assert 'Sales report' in text and 'Total sales: 60' in text\n    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}\n    assert len(document.findall('.//w:tr', ns)) == 4\nprint('DOCX content and relationships verified')\nPY`,
      );
      expect(checked.exitCode).toBe(0);
      expect(checked.stdout).toContain('DOCX content and relationships verified');
    } finally {
      sandbox.onModuleDestroy();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
