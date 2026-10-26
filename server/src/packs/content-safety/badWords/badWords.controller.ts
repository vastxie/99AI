import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { BadWordsService } from './badWords.service';
import { QueryViolationDto } from './dto/queryViolation.dto';
import { UpdateWhitelistDto, WhitelistIdDto } from './dto/whitelist.dto';

@ApiTags('badWords')
@Controller('badWords')
export class BadWordsController {
  constructor(private readonly badWordsService: BadWordsService) {}

  /* ========== 词库管理 ========== */
  @Get('vocabularies')
  @ApiOperation({ summary: '获取所有可用词库列表' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  getVocabularies() {
    return this.badWordsService.getVocabularies();
  }

  /* ========== 白名单管理 ========== */
  @Get('whitelist')
  @ApiOperation({ summary: '查询白名单' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  queryWhitelist(@Query() query: any) {
    return this.badWordsService.queryWhitelist(query);
  }

  @Post('whitelist/add')
  @ApiOperation({ summary: '添加白名单词语' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  addWhitelist(@Body() body: { word: string; remark?: string }) {
    return this.badWordsService.addWhitelist(body);
  }

  @Post('whitelist/batchAdd')
  @ApiOperation({ summary: '批量添加白名单' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  batchAddWhitelist(@Body() body: { words: string }) {
    return this.badWordsService.batchAddWhitelist(body);
  }

  @Post('whitelist/del')
  @ApiOperation({ summary: '删除白名单' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  delWhitelist(@Body() body: WhitelistIdDto) {
    return this.badWordsService.delWhitelist(body);
  }

  @Post('whitelist/update')
  @ApiOperation({ summary: '修改白名单' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  updateWhitelist(@Body() body: UpdateWhitelistDto) {
    return this.badWordsService.updateWhitelist(body);
  }

  /* ========== 腾讯云文本审核 ========== */
  @Post('testTencentTextConfig')
  @ApiOperation({ summary: '测试腾讯云文本审核配置' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  testTencentTextConfig() {
    return this.badWordsService.testTencentTextConfig();
  }

  /* ========== 违规记录 ========== */
  @Get('violation')
  @ApiOperation({ summary: '查询违规记录' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  violation(@Req() req: Request, @Query() query: QueryViolationDto) {
    return this.badWordsService.violation(req, query);
  }
}
