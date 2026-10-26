import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { requireRequestUser } from '@/common/auth/request-user';
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ChatGroupService } from './chatGroup.service';
import { CreateConversationDto } from './dto/createConversation.dto';
import { DeleteConversationDto } from './dto/deleteConversation.dto';
import { UpdateConversationDto } from './dto/updateConversation.dto';

@Controller('group')
@ApiTags('group')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class ChatGroupController {
  constructor(private readonly chatGroupService: ChatGroupService) {}

  @Get('query')
  @ApiOperation({ summary: '查询我的会话' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async query(@Req() req: Request) {
    return this.chatGroupService.queryConversations(requireRequestUser(req));
  }

  @Post('create')
  @ApiOperation({ summary: '创建会话' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: Request, @Body() body: CreateConversationDto) {
    return this.chatGroupService.createConversation(requireRequestUser(req), body);
  }

  @Post('update')
  @ApiOperation({ summary: '更新会话' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async update(@Req() req: Request, @Body() body: UpdateConversationDto) {
    const { gid, ...input } = body;
    return this.chatGroupService.updateConversation(gid, requireRequestUser(req), input);
  }

  @Post('del')
  @ApiOperation({ summary: '删除会话' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async del(@Req() req: Request, @Body() body: DeleteConversationDto) {
    return this.chatGroupService.softDeleteConversation(body.gid, requireRequestUser(req));
  }
}
