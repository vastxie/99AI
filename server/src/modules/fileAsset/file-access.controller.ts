import { FileAccessAuthGuard } from '@/common/auth/fileAccessAuth.guard';
import { requireRequestUser } from '@/common/auth/request-user';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { Public } from '@/common/auth/public.decorator';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { getErrorStack } from '@/common/utils/error-stack.util';
import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Logger,
  Param,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Readable } from 'stream';
import { GLOBAL_CONFIG_SERVICE, GlobalConfigReader } from '../globalConfig/globalConfig.tokens';
import { FileAssetStorageService } from './fileAsset-storage.service';
import { FileAssetEntity } from './fileAsset.entity';
import { FileAssetService } from './fileAsset.service';
import { resolveFileDeliveryHeaders } from './fileAsset.util';

interface ParsedByteRange {
  start: number;
  end: number;
}

function contentDisposition(
  filename: string,
  disposition: 'attachment' | 'inline' = 'attachment',
): string {
  const safeFilename = String(filename || 'file')
    .replace(/[\r\n]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_');
  const fallback = safeFilename || 'file';
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(
    filename || fallback,
  )}`;
}

/** 访客按 visitorId、注册用户按数字 id 归属（req.user.id 对访客就是 visitorId 字符串） */
function actorFromRequest(req: Request) {
  const user = req.user;
  const role = user?.role || null;
  if (role === 'visitor') {
    return { role, visitorId: user?.id ? String(user.id) : null };
  }
  return { role, id: user?.id ?? null };
}

function parseRangeHeader(rangeHeader: string | undefined, size: number): ParsedByteRange | null {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || size < 1) return null;

  const [, startText, endText] = match;
  if (!startText && !endText) return null;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(size - suffixLength, 0), end: size - 1 };
  }

  const start = Number(startText);
  const end = endText ? Number(endText) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

function isLocalStorage(file: FileAssetEntity): boolean {
  return !file.storageProvider || file.storageProvider === 'local';
}

const DEFAULT_SIGNED_URL_TTL_SECONDS = 600;
const DEFAULT_PREVIEW_MAX_FILE_SIZE_MB = 20;

@ApiTags('files')
@Controller('files')
export class FileAccessController {
  constructor(
    private readonly fileAssetService: FileAssetService,
    private readonly fileAssetStorageService: FileAssetStorageService,
    @Inject(GLOBAL_CONFIG_SERVICE)
    private readonly globalConfigService: GlobalConfigReader,
  ) {}

  @Get(':fileId/meta')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取文件安全展示信息' })
  async meta(@Param('fileId') fileId: string, @Req() req: Request) {
    const file = await this.fileAssetService.findByFileId(fileId);
    this.fileAssetService.assertAccessible(file, actorFromRequest(req));
    return this.fileAssetService.toFrontendFileAsset(file);
  }

  @Get('admin/query')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理端查询私有文件记录' })
  async adminQuery(@Query() query: any) {
    return await this.fileAssetService.queryAdminFiles(query);
  }

  @Get('admin/:fileId')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理端查询私有文件详情' })
  async adminDetail(@Param('fileId') fileId: string) {
    return await this.fileAssetService.getAdminFileDetail(fileId);
  }

  @Post('admin/batch-delete')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理端批量清空私有文件内容' })
  async adminBatchDelete(@Body() body: any, @Req() req: Request) {
    return await this.fileAssetService.batchDeleteFiles(
      body?.fileIds || [],
      requireRequestUser(req),
    );
  }

  @Post('admin/clear')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理端按条件清空私有文件内容' })
  async adminClear(@Body() body: any, @Req() req: Request) {
    return await this.fileAssetService.clearFiles(body || {}, requireRequestUser(req));
  }

  @Post('admin/cleanup/run')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理端手动执行私有文件清理' })
  async adminRunCleanup() {
    return await this.fileAssetService.cleanupExpiredFiles();
  }

  @Get(':fileId/preview')
  // 媒体标签直链场景：Bearer 优先，回退 fa_token cookie
  @UseGuards(FileAccessAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '预览私有文件' })
  async preview(
    @Param('fileId') fileId: string,
    @Req() req: Request,
    @Res() res: Response,
    @Headers('range') range?: string,
  ) {
    const file = await this.fileAssetService.findActiveForPreview(fileId, actorFromRequest(req));
    await this.openFile(file, res, 'inline', range);
  }

  @Get(':fileId/download')
  // 媒体标签直链场景：Bearer 优先，回退 fa_token cookie
  @UseGuards(FileAccessAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '下载私有文件' })
  async download(
    @Param('fileId') fileId: string,
    @Req() req: Request,
    @Res() res: Response,
    @Headers('range') range?: string,
  ) {
    const file = await this.fileAssetService.findActiveForDownload(fileId, actorFromRequest(req));
    await this.openFile(file, res, 'attachment', range);
  }

  @Get('public/:fileId/preview')
  @Public()
  @ApiOperation({ summary: '预览公开文件' })
  async publicPreview(
    @Param('fileId') fileId: string,
    @Res() res: Response,
    @Headers('range') range?: string,
  ) {
    const file = await this.fileAssetService.findActivePublicForPreview(fileId);
    await this.openFile(file, res, 'inline', range);
  }

  @Get('public/:fileId/download')
  @Public()
  @ApiOperation({ summary: '下载公开文件' })
  async publicDownload(
    @Param('fileId') fileId: string,
    @Res() res: Response,
    @Headers('range') range?: string,
  ) {
    const file = await this.fileAssetService.findActivePublicForDownload(fileId);
    await this.openFile(file, res, 'attachment', range);
  }

  private async openFile(
    file: FileAssetEntity,
    res: Response,
    disposition: 'attachment' | 'inline',
    rangeHeader?: string,
  ) {
    if (disposition === 'inline') {
      await this.assertPreviewSizeAllowed(file);
    }

    if (!isLocalStorage(file)) {
      return this.redirectToSignedUrl(file, res, disposition);
    }

    const stat = await this.fileAssetStorageService.getObjectStat(
      file.storageScope,
      { bucket: file.bucket || undefined, objectKey: file.objectKey },
      file.storageProvider,
    );
    if (!stat.exists || typeof stat.size !== 'number') {
      res.status(404).end('File not found');
      return;
    }

    const range = parseRangeHeader(rangeHeader, stat.size);
    if (rangeHeader && !range) {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      res.end();
      return;
    }

    const rangeValue = range ? `bytes=${range.start}-${range.end}` : undefined;
    const result = await this.fileAssetStorageService.getObjectStream(
      file.storageScope,
      { bucket: file.bucket || undefined, objectKey: file.objectKey, range: rangeValue },
      file.storageProvider,
    );

    const contentLength = range ? range.end - range.start + 1 : stat.size;
    if (range) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
    }
    // 响应头由服务端按扩展名 / MIME 决定：可执行脚本的类型强制下载并附沙箱 CSP，非安全类型不内联
    const delivery = resolveFileDeliveryHeaders({
      mime: file.mime || result.mime,
      name: file.name || file.originalName,
      ext: file.ext,
      disposition,
    });
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', delivery.contentType);
    res.setHeader('Content-Length', String(contentLength));
    res.setHeader(
      'Content-Disposition',
      contentDisposition(file.name || file.originalName, delivery.disposition),
    );
    if (delivery.contentSecurityPolicy) {
      res.setHeader('Content-Security-Policy', delivery.contentSecurityPolicy);
    }
    res.setHeader(
      'Cache-Control',
      file.storageScope === 'public' && file.visibility === 'public'
        ? 'public, max-age=31536000, immutable'
        : 'private, no-store',
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');

    this.pipeStream(result.stream, file.fileId, res);
    await this.fileAssetService.markAccessed(file.fileId);
  }

  private async redirectToSignedUrl(
    file: FileAssetEntity,
    res: Response,
    disposition: 'attachment' | 'inline',
  ) {
    const ttl = await this.getSignedUrlTtlSeconds();
    const delivery = resolveFileDeliveryHeaders({
      mime: file.mime,
      name: file.name || file.originalName,
      ext: file.ext,
      disposition,
    });
    const signedUrl = await this.fileAssetStorageService.createSignedReadUrl(
      file.storageScope,
      {
        bucket: file.bucket || undefined,
        objectKey: file.objectKey,
        expiresInSeconds: ttl,
        responseContentType: delivery.contentType,
        responseContentDisposition: contentDisposition(
          file.name || file.originalName,
          delivery.disposition,
        ),
      },
      file.storageProvider,
    );
    await this.fileAssetService.markAccessed(file.fileId);
    return res.redirect(302, signedUrl);
  }

  private async getSignedUrlTtlSeconds(): Promise<number> {
    const value = await this.globalConfigService.getConfigs(['privateSignedUrlTtlSeconds']);
    const ttl = Number(value);
    return Math.max(
      60,
      Math.min(Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_SIGNED_URL_TTL_SECONDS, 3600),
    );
  }

  private async assertPreviewSizeAllowed(file: FileAssetEntity): Promise<void> {
    const configs = await this.globalConfigService.getConfigs(['fileAssetPreviewMaxFileSizeMb']);
    const parsed = Number(configs);
    const maxMb = Math.max(
      1,
      Math.min(
        1024,
        Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PREVIEW_MAX_FILE_SIZE_MB,
      ),
    );
    if (Number(file.size || 0) > maxMb * 1024 * 1024) {
      throw new PayloadTooLargeException('文件超过在线预览上限，请下载后查看。');
    }
  }

  private pipeStream(stream: Readable, fileId: string, res: Response): void {
    stream.on('error', error => {
      Logger.error('文件输出流失败', getErrorStack(error), 'FileAccessController');
      if (!res.headersSent) {
        res.status(500).end('File stream failed');
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  }
}
