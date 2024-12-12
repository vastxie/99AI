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
import { BadWordsService } from './badWords.service';
import { AddBadWordDto } from './dto/addBadWords.dto';
import { DelBadWordsDto } from './dto/delBadWords.dto';
import { QueryBadWordsDto } from './dto/queryBadWords.dto';
import { QueryViolationDto } from './dto/queryViolation.dto';
import { UpdateBadWordsDto } from './dto/updateBadWords.dto';

@ApiTags('badWords')
@Controller('badWords')
export class BadWordsController {
  constructor(private readonly badWordsService: BadWordsService) {}

  @Get('query')
  @ApiOperation({ summary: '查询所有敏感词' })
  queryBadWords(@Query() query: QueryBadWordsDto) {
    return this.badWordsService.queryBadWords(query);
  }

  @Post('del')
  @ApiOperation({ summary: '删除敏感词' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  delBadWords(@Body() body: DelBadWordsDto) {
    return this.badWordsService.delBadWords(body);
  }

  @Post('update')
  @ApiOperation({ summary: '更新敏感词' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  updateBadWords(@Body() body: UpdateBadWordsDto) {
    return this.badWordsService.updateBadWords(body);
  }

  @Post('add')
  @ApiOperation({ summary: '新增敏感词' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  addBadWord(@Body() body: AddBadWordDto) {
    return this.badWordsService.addBadWord(body);
  }

  @Get('violation')
  @ApiOperation({ summary: '查询违规记录' })
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  violation(@Req() req: Request, @Query() query: QueryViolationDto) {
    return this.badWordsService.violation(req, query);
  }
}
