import { CramiService } from './crami.service';
import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreatePackageDto } from './dto/createPackage.dto';
import { UpdatePackageDto } from './dto/updatePackage.dto';
import { CreatCramiDto } from './dto/createCrami.dto';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { Request } from 'express';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { UseCramiDto } from './dto/useCrami.dto';
import { QuerAllPackageDto } from './dto/queryAllPackage.dto';
import { DeletePackageDto } from './dto/deletePackage.dto';
import { QuerAllCramiDto } from './dto/queryAllCrami.dto';
import { AdminAuthGuard } from '@/common/auth/adminAuth.guard';
import { BatchDelCramiDto } from './dto/batchDelCrami.dto';

@ApiTags('Crami')
@Controller('crami')
export class CramiController {
  constructor(private readonly cramiService: CramiService) {}

  @Get('queryOnePackage')
  @ApiOperation({ summary: '查询单个套餐' })
  async queryOnePackage(@Query('id') id: number) {
    return this.cramiService.queryOnePackage(id);
  }

  @Get('queryAllPackage')
  @ApiOperation({ summary: '查询所有套餐' })
  async queryAllPackage(@Query() query: QuerAllPackageDto) {
    return this.cramiService.queryAllPackage(query);
  }

  @Post('createPackage')
  @ApiOperation({ summary: '创建套餐' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async createPackage(@Body() body: CreatePackageDto) {
    return this.cramiService.createPackage(body);
  }

  @Post('updatePackage')
  @ApiOperation({ summary: '更新套餐' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async updatePackage(@Body() body: UpdatePackageDto) {
    return this.cramiService.updatePackage(body);
  }

  @Post('delPackage')
  @ApiOperation({ summary: '删除套餐' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async delPackage(@Body() body: DeletePackageDto) {
    return this.cramiService.delPackage(body);
  }

  @Post('createCrami')
  @ApiOperation({ summary: '生成卡密' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async createCrami(@Body() body: CreatCramiDto) {
    return this.cramiService.createCrami(body);
  }

  @Post('useCrami')
  @ApiOperation({ summary: '使用卡密' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async useCrami(@Req() req: Request, @Body() body: UseCramiDto) {
    return this.cramiService.useCrami(req, body);
  }

  @Get('queryAllCrami')
  @ApiOperation({ summary: '查询所有卡密' })
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  async queryAllCrami(@Query() params: QuerAllCramiDto, @Req() req: Request) {
    return this.cramiService.queryAllCrami(params, req);
  }

  @Post('delCrami')
  @ApiOperation({ summary: '删除卡密' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async delCrami(@Body('id') id: number) {
    return this.cramiService.delCrami(id);
  }

  @Post('batchDelCrami')
  @ApiOperation({ summary: '批量删除卡密' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async batchDelCrami(@Body() body: BatchDelCramiDto) {
    return this.cramiService.batchDelCrami(body);
  }
}
