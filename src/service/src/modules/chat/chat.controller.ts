import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwtAuth.guard';
import { ChatService } from './chat.service';

import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { ChatProcessDto } from './dto/chatProcess.dto';
// import { MjDrawDto } from './dto/mjDraw.dto';
import { AiPptService } from '../ai/aiPPT';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';

@ApiTags('chatgpt')
@Controller('chatgpt')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly aiPptService: AiPptService
  ) {}

  @Post('chat-process')
  @ApiOperation({ summary: 'gpt聊天对话' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  chatProcess(
    @Body() body: ChatProcessDto,
    @Req() req: Request,
    @Res() res: Response
  ) {
    return this.chatService.chatProcess(body, req, res);
  }

  @Post('chat-sync')
  @ApiOperation({ summary: 'gpt聊天对话' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  chatProcessSync(@Body() body: ChatProcessDto, @Req() req: Request) {
    return this.chatService.chatProcess({ ...body }, req);
  }

  @Post('mj-fy')
  @ApiOperation({ summary: 'gpt描述词绘画翻译' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async mjFanyi(@Body() body: ChatProcessDto, @Req() req: Request) {
    return this.chatService.chatProcess(
      { ...body, specialModel: 'PromptOptimization' },
      req
    );
  }

  @Post('chat-mind')
  @ApiOperation({ summary: 'mind思维导图提示' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async chatmind(
    @Body() body: ChatProcessDto,
    @Req() req: Request,
    @Res() res: Response
  ) {
    return this.chatService.chatProcess(
      { ...body, specialModel: 'MindMap' },
      req,
      res
    );
  }

  @Post('tts-process')
  @ApiOperation({ summary: 'tts语音播报' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  ttsProcess(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    return this.chatService.ttsProcess(body, req, res);
  }

  @Post('ppt-cover')
  @ApiOperation({ summary: 'ppt封面获取' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  pptCover(
    @Body() body: any
    // @Req() req: Request,
  ) {
    return this.aiPptService.pptCover(body);
  }
}
