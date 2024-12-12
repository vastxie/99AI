import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatGroupService } from './chatGroup.service';
import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CreateGroupDto } from './dto/createGroup.dto';
import { Request } from 'express';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { DelGroupDto } from './dto/delGroup.dto';
import { UpdateGroupDto } from './dto/updateGroup.dto';

@ApiTags('group')
@Controller('group')
export class ChatGroupController {
  constructor(private readonly chatGroupService: ChatGroupService) {}

  @Post('create')
  @ApiOperation({ summary: '创建对话组' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  create(@Body() body: CreateGroupDto, @Req() req: Request) {
    return this.chatGroupService.create(body, req);
  }

  @Get('query')
  @ApiOperation({ summary: '查询对话组' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  query(@Req() req: Request) {
    return this.chatGroupService.query(req);
  }

  @Post('update')
  @ApiOperation({ summary: '更新对话组' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  update(@Body() body: UpdateGroupDto, @Req() req: Request) {
    return this.chatGroupService.update(body, req);
  }

  @Post('del')
  @ApiOperation({ summary: '删除对话组' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  del(@Body() body: DelGroupDto, @Req() req: Request) {
    return this.chatGroupService.del(body, req);
  }

  @Post('delAll')
  @ApiOperation({ summary: '删除对话组' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  delAll(@Req() req: Request) {
    return this.chatGroupService.delAll(req);
  }
}
