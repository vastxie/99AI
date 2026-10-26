import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import {
  BadRequestException,
  Controller,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { UploadService } from './upload.service';
import type { UploadedFileLike } from './upload.service';

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('file')
  @ApiOperation({ summary: '上传文件' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB上限（实际限制由配置控制，在service层验证）
      },
    }),
  )
  async uploadFile(
    @UploadedFile() file: UploadedFileLike,
    @Req() req: Request,
    @Query('dir') dir?: string,
    @Query('purpose') purpose?: string,
    @Query('visibility') visibility?: string,
  ) {
    // Controller 层校验 dir 参数：只允许字母、数字、斜杠、连字符、下划线
    if (dir && !/^[a-zA-Z0-9\/\-_]+$/.test(dir)) {
      throw new BadRequestException('目录参数包含非法字符');
    }
    return this.uploadService.uploadFileAsset(file, { dir, user: req.user, purpose, visibility });
  }
}
