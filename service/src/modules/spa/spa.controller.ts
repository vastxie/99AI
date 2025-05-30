import { Controller, Get, Logger, Next, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import * as fs from 'fs';
import { join } from 'path';

@ApiTags('spa')
@Controller()
export class SpaController {
  private readonly logger = new Logger(SpaController.name);
  private readonly indexPath = join(process.cwd(), 'public/chat/index.html');
  private readonly publicPath = join(process.cwd(), 'public/chat');
  private readonly exists: boolean;
  private readonly adminPath: string;

  constructor() {
    // 检查index.html是否存在
    this.exists = fs.existsSync(this.indexPath);

    // 获取管理后台路径
    this.adminPath = process.env.ADMIN_SERVE_ROOT || '/admin';
    Logger.log(`管理后台路径已配置: ${this.adminPath}`, 'SpaController');
  }

  @Get('*')
  serveClient(@Req() req: Request, @Res() res: Response, @Next() next) {
    // 记录请求路径
    this.logger.debug(`收到请求: ${req.path}`);

    // 跳过API请求和静态资源目录请求
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/file') ||
      req.path.startsWith(this.adminPath)
    ) {
      return next();
    }

    // 检查是否为静态资源请求（如js、css等文件）
    const filePath = join(this.publicPath, req.path);
    if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
      return next();
    }

    // 检查index.html是否存在
    if (!this.exists) {
      return res.status(500).send({ code: 500, message: 'SPA入口文件不存在', data: null });
    }

    // 返回SPA入口文件
    return res.sendFile(this.indexPath);
  }
}
