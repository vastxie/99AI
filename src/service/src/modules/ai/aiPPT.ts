import { Injectable, Logger } from '@nestjs/common';
import { ChatLogService } from '../chatLog/chatLog.service';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { ModelsService } from '../models/models.service';
import { UploadService } from '../upload/upload.service';
import { OpenAIChatService } from './openaiChat.service';
// 引入其他需要的模块或服务

@Injectable()
export class AiPptService {
  private readonly logger = new Logger(AiPptService.name);
  constructor(
    private readonly uploadService: UploadService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly chatLogService: ChatLogService,
    private readonly openAIChatService: OpenAIChatService,
    private readonly modelsService: ModelsService
  ) {}

  async aiPPT(inputs) {
    return;
  }

  async pptCover(inputs) {
    return;
  }
}
