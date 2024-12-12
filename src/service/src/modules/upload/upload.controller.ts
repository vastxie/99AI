import {
  Body,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UploadService } from './upload.service';

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('file')
  @ApiOperation({ summary: '上传文件' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file, @Query('dir') dir?: string) {
    return this.uploadService.uploadFile(file, dir);
  }

  @Post('fileFromUrl')
  @ApiOperation({ summary: '从URL上传文件' })
  async uploadFileFromUrl(@Body() { url, dir = 'ai' }): Promise<any> {
    return this.uploadService.uploadFileFromUrl({ url, dir });
  }

  // @Get('test')
  // @ApiOperation({ summary: '测试' })
  // async test() {
  //   return this.uploadService.test();
  // }
}
