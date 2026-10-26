import { NestFactory } from '@nestjs/core';
import { VerticalImportService } from './vertical-import.service';

/**
 * `node dist/main vertical:import <manifest.json> [--dry-run]`
 * 以应用上下文（不监听端口）运行导入，输出 JSON 报告；有 errors 时退出码 1。
 */
export async function runVerticalImportCli(
  argv: string[],
  loadAppModule: () => Promise<any> = async () => (await import('../../app.module')).AppModule,
): Promise<number> {
  const dryRun = argv.includes('--dry-run');
  const manifestPath = argv.find(item => !item.startsWith('--'));
  if (!manifestPath) {
    process.stderr.write('用法：node dist/main vertical:import <manifest.json> [--dry-run]\n');
    return 2;
  }
  const AppModule = await loadAppModule();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const report = await app.get(VerticalImportService).importFromFile(manifestPath, { dryRun });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.errors.length ? 1 : 0;
  } finally {
    await app.close();
  }
}
