import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ShareService } from './share.service';

@ApiTags('share')
@Controller('share')
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  @UseGuards(JwtAuthGuard)
  @Post('create')
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建分享' })
  async createShare(@Body('htmlContent') htmlContent: string) {
    if (!htmlContent) {
      throw new HttpException('HTML content is required', HttpStatus.BAD_REQUEST);
    }
    const shareCode = await this.shareService.createShare(htmlContent);
    return { shareCode };
  }

  @Get(':shareCode')
  @ApiOperation({ summary: '获取分享内容' })
  async getShare(@Param('shareCode') shareCode: string) {
    const share = await this.shareService.getShareByCode(shareCode);
    if (!share) {
      throw new HttpException('Share not found', HttpStatus.NOT_FOUND);
    }
    return { htmlContent: share.htmlContent };
  }
}
