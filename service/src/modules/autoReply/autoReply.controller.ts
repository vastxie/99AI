import { AdminAuthGuard } from '@/common/auth/adminAuth.guard';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AutoReplyService } from './autoReply.service';
import { AddAutoReplyDto } from './dto/addAutoReply.dto';
import { DelAutoReplyDto } from './dto/delBadWords.dto';
import { QueryAutoReplyDto } from './dto/queryAutoReply.dto';
import { UpdateAutoReplyDto } from './dto/updateAutoReply.dto';

@ApiTags('autoReply')
@Controller('autoReply')
export class AutoReplyController {
  constructor(private readonly autoReplyService: AutoReplyService) {}

  @Get('query')
  @ApiOperation({ summary: '查询自动回复' })
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  queryAutoReply(@Query() query: QueryAutoReplyDto) {
    return this.autoReplyService.queryAutoReply(query);
  }

  @Post('add')
  @ApiOperation({ summary: '添加自动回复' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  addAutoReply(@Body() body: AddAutoReplyDto) {
    return this.autoReplyService.addAutoReply(body);
  }

  @Post('update')
  @ApiOperation({ summary: '修改自动回复' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  updateAutoReply(@Body() body: UpdateAutoReplyDto) {
    return this.autoReplyService.updateAutoReply(body);
  }

  @Post('del')
  @ApiOperation({ summary: '删除自动回复' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  delAutoReply(@Body() body: DelAutoReplyDto) {
    return this.autoReplyService.delAutoReply(body);
  }
}
