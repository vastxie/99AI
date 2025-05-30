import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import {
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
        fileSize: 10 * 1024 * 1024, // 10MB大小限制
      },
    }),
  )
  async uploadFile(@UploadedFile() file, @Req() req: Request, @Query('dir') dir?: string) {
    return this.uploadService.uploadFile(file, dir, req.user);
  }

  // @Post('fileFromUrl')
  // @ApiOperation({ summary: '从URL上传文件' })
  // async uploadFileFromUrl(@Body() { url, dir = 'ai' }): Promise<any> {
  //   return this.uploadService.uploadFileFromUrl({ url, dir });
  // }
}
