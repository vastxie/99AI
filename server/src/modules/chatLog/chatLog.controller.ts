import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ChatLogService } from './chatLog.service';
import { ChatAroundDto } from './dto/chatAround.dto';
import { ChatListDto } from './dto/chatList.dto';
import { ChatSearchDto } from './dto/chatSearch.dto';
import { DelDto } from './dto/del.dto';
import { QueryAllChatLogDto } from './dto/queryAllChatLog.dto';

@Controller('chatLog')
@ApiTags('chatLog')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class ChatLogController {
  constructor(private readonly chatLogService: ChatLogService) {}

  @Get('chatAll')
  @ApiOperation({ summary: '查询所有的问答记录' })
  @ApiBearerAuth()
  @UseGuards(SuperAuthGuard)
  queryAllChatLog(@Query() params: QueryAllChatLogDto, @Req() req: Request) {
    return this.chatLogService.queryAllChatLog(params, req);
  }

  @Get('chatList')
  @ApiOperation({ summary: '查询我的问答记录' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  chatList(@Req() req: Request, @Query() params: ChatListDto) {
    return this.chatLogService.chatList(req, params);
  }

  @Get('search')
  @ApiOperation({ summary: '搜索我的消息内容' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  search(@Req() req: Request, @Query() params: ChatSearchDto) {
    return this.chatLogService.search(req, params);
  }

  @Get('chatAround')
  @ApiOperation({ summary: '查询指定消息附近的对话内容' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  chatAround(@Req() req: Request, @Query() params: ChatAroundDto) {
    return this.chatLogService.chatAround(req, params);
  }

  @Post('del')
  @ApiOperation({ summary: '删除我的问答记录' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  del(@Req() req: Request, @Body() body: DelDto) {
    return this.chatLogService.deleteChatLog(req, body);
  }
}
