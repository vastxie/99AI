import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { Public } from '@/common/auth/public.decorator';
import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { QueryModelDto } from './dto/queryModel.dto';
import type { RemoteModelListItemResponse } from './dto/remoteModelList.dto';
import { SetModelDto } from './dto/setModel.dto';
import { ModelsService } from './models.service';

@ApiTags('models')
@Controller('models')
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Post('setModel')
  @ApiOperation({ summary: '设置模型' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  setModel(@Body() params: SetModelDto) {
    return this.modelsService.setModel(params);
  }

  @Post('setModelStatus')
  @ApiOperation({ summary: '设置模型启用状态' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  setModelStatus(@Body() params: { id: number; status: boolean }) {
    return this.modelsService.setModelStatus(params);
  }

  @Post('delModel')
  @ApiOperation({ summary: '删除模型' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  delModel(@Body() params: { id: number }) {
    return this.modelsService.delModel(params);
  }

  @Post('previewRequestUrl')
  @ApiOperation({ summary: '预览模型完整请求地址' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  previewRequestUrl(@Body() params: any) {
    return this.modelsService.previewRequestUrl(params);
  }

  @Post('testConnection')
  @ApiOperation({ summary: '后端测试模型连接' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  testConnection(@Body() params: any) {
    return this.modelsService.testConnection(params);
  }

  @Post('listRemoteModels')
  @ApiOperation({ summary: '后端拉取远程模型列表' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  listRemoteModels(@Body() params: any): Promise<RemoteModelListItemResponse[]> {
    return this.modelsService.listRemoteModels(params);
  }

  @Get('gatewayProfiles')
  @ApiOperation({ summary: '查询模型网关供应商模板' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  gatewayProfiles() {
    return this.modelsService.getGatewayProfiles();
  }

  @Get('query')
  @ApiOperation({ summary: '管理端查询模型列表' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  queryModels(@Req() req: Request, @Query() params: QueryModelDto) {
    return this.modelsService.queryModels(req, params);
  }

  @Get('list')
  @Public()
  @ApiOperation({ summary: '客户端查询当前所有可以使用的模型' })
  modelsList() {
    return this.modelsService.modelsList();
  }

  @Get('baseConfig')
  @Public()
  @ApiOperation({ summary: '客户端查询当前已经配置模型的基础配置' })
  baseConfig() {
    return this.modelsService.getBaseConfig();
  }
}
