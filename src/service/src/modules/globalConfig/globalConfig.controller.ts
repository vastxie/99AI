import { AdminAuthGuard } from '@/common/auth/adminAuth.guard';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { QueryConfigDto } from './dto/queryConfig.dto';
import { SetConfigDto } from './dto/setConfig.dto';
import { GlobalConfigService } from './globalConfig.service';

@ApiTags('config')
@Controller('config')
export class GlobalConfigController {
  constructor(private readonly globalConfigService: GlobalConfigService) {}

  @ApiOperation({ summary: '查询所有配置' })
  @Get('queryAll')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  queryAllConfig(@Req() req: Request) {
    return this.globalConfigService.queryAllConfig(req);
  }

  @ApiOperation({ summary: '查询前端网站的所有配置' })
  @Get('queryFronet')
  queryFrontConfig(@Query() query: any, @Req() req: Request) {
    return this.globalConfigService.queryFrontConfig(query, req);
  }

  @ApiOperation({ summary: '查询所有配置' })
  @Post('query')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  queryConfig(@Body() body: QueryConfigDto, @Req() req: Request) {
    return this.globalConfigService.queryConfig(body, req);
  }

  @ApiOperation({ summary: '设置配置信息' })
  @Post('set')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  setConfig(@Body() body: SetConfigDto) {
    return this.globalConfigService.setConfig(body);
  }

  @ApiOperation({ summary: '用户端查询公告信息' })
  @Get('notice')
  queryNotice() {
    return this.globalConfigService.queryNotice();
  }
}
