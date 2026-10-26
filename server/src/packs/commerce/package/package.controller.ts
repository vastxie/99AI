import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { Public } from '@/common/auth/public.decorator';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PackageService } from './package.service';
import { CreatePackageDto } from './dto/createPackage.dto';
import { DeletePackageDto } from './dto/deletePackage.dto';
import { QueryAllPackageDto } from './dto/queryAllPackage.dto';
import { UpdatePackageDto } from './dto/updatePackage.dto';

@ApiTags('package')
@Controller('package')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PackageController {
  constructor(private readonly packageService: PackageService) {}

  @Get('queryAllPackage')
  @ApiOperation({ summary: '查询所有套餐' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async queryAllPackage(@Query() query: QueryAllPackageDto) {
    return this.packageService.queryAllPackage(query);
  }

  @Get('queryPlans')
  @Public()
  @ApiOperation({ summary: '查询套餐方案和规格' })
  async queryPlans(@Query() query: QueryAllPackageDto) {
    return this.packageService.queryPlans(query);
  }

  @Post('createPackage')
  @ApiOperation({ summary: '创建套餐' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async createPackage(@Body() body: CreatePackageDto) {
    return this.packageService.createPackage(body);
  }

  @Post('updatePackage')
  @ApiOperation({ summary: '更新套餐' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async updatePackage(@Body() body: UpdatePackageDto) {
    return this.packageService.updatePackage(body);
  }

  @Post('delPackage')
  @ApiOperation({ summary: '删除套餐' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async delPackage(@Body() body: DeletePackageDto) {
    return this.packageService.delPackage(body);
  }
}
