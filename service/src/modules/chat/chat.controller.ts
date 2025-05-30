import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwtAuth.guard';
import { ChatService } from './chat.service';

import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { ChatProcessDto } from './dto/chatProcess.dto';

@ApiTags('chatgpt')
@Controller('chatgpt')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('chat-process')
  @ApiOperation({ summary: 'gpt聊天对话' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  chatProcess(@Body() body: ChatProcessDto, @Req() req: Request, @Res() res: Response) {
    return this.chatService.chatProcess(body, req, res);
  }

  @Post('tts-process')
  @ApiOperation({ summary: 'tts语音播报' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  ttsProcess(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    return this.chatService.ttsProcess(body, req, res);
  }
}
