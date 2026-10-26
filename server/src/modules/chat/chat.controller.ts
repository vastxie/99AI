import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwtAuth.guard';
import { ChatControlService } from './chat-control.service';
import { StopChatDto } from './dto/stopChat.dto';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatControl: ChatControlService) {}

  @Post('stop')
  @ApiOperation({ summary: '停止生成（HTTP fallback）' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async stopChat(@Body() body: StopChatDto, @Req() req: any) {
    return this.chatControl.stopChat(body.cid, req.user);
  }
}
