import { Global, Module } from '@nestjs/common';
import { VerticalImportRegistry } from './vertical-import.registry';
import { VerticalImportService } from './vertical-import.service';

/**
 * 垂直包接入（内核）：清单导入服务与扩展段注册表。
 * 扩展包在自己的模块里向 VerticalImportRegistry 注册 extensions.<section> 的处理器。
 */
@Global()
@Module({
  providers: [VerticalImportRegistry, VerticalImportService],
  exports: [VerticalImportRegistry, VerticalImportService],
})
export class VerticalModule {}
