import { RawResponse } from '@/common/interceptors/raw-response.decorator';
import { Public } from '@/common/auth/public.decorator';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CreateMenuDto } from './dto/createMenu.dto';
import { OfficialService } from './official.service';

@ApiTags('official')
@Controller('official')
export class OfficialController {
  constructor(private readonly officialService: OfficialService) {}

  @RawResponse()
  @Get('notify')
  @Public()
  @ApiOperation({ summary: '公众号通知接口GET' })
  async notify(@Req() req: Request, @Query() query: Record<string, string>, @Body() body: unknown) {
    Logger.debug('GET通知 - ' + JSON.stringify(query), 'OfficialController');
    const result = await this.officialService.verify(query.signature, query.nonce, query.timestamp);
    return result ? query.echostr : '';
  }

  @RawResponse()
  @Post('notify')
  @Public()
  @ApiOperation({ summary: '公众号通知接口POST' })
  async notifyPost(
    @Req() req: Request,
    @Query() query: Record<string, string>,
    @Body() xmlData: unknown,
    @Res() res: Response,
  ) {
    const verified = await this.officialService.verify(
      query.signature,
      query.nonce,
      query.timestamp,
    );
    if (!verified) {
      Logger.warn('公众号POST回调签名校验失败，已拒绝处理', 'OfficialController');
      return res.status(200).send('');
    }

    const responseBody = await this.officialService.handleNotifyPostMessage(xmlData);
    return res.status(200).send(responseBody);
  }

  @Post('menu')
  @ApiOperation({ summary: '创建自定义菜单' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async createMenu(@Body() menuData: CreateMenuDto) {
    Logger.log('创建自定义菜单', 'OfficialController');
    return this.officialService.createMenu(menuData);
  }

  @Get('menu')
  @ApiOperation({ summary: '获取自定义菜单' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async getMenu() {
    Logger.log('获取自定义菜单', 'OfficialController');
    return this.officialService.getMenu();
  }

  @Delete('menu')
  @ApiOperation({ summary: '删除自定义菜单' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async deleteMenu() {
    Logger.log('删除自定义菜单', 'OfficialController');
    return this.officialService.deleteMenu();
  }

  @Get('material/list')
  @ApiOperation({ summary: '获取素材列表' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async getMaterialList(
    @Query('type') type: string,
    @Query('offset') offset: number = 0,
    @Query('count') count: number = 20,
  ) {
    Logger.log(
      `获取素材列表 - 类型: ${type}, offset: ${offset}, count: ${count}`,
      'OfficialController',
    );
    return this.officialService.getMaterialList(type, offset, count);
  }
}
