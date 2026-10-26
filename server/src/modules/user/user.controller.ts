import { RegisteredUserAuthGuard } from '@/common/auth/registeredUserAuth.guard';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { Body, Controller, Get, Post, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { QueryAllUserDto } from './dto/queryAllUser.dto';
import { ResetUserPassDto } from './dto/resetUserPass.dto';
import { UpdateUserDto } from './dto/updateUser.dto';
import { UpdateUserStatusDto } from './dto/updateUserStatus.dto';
import { UserService } from './user.service';

@Controller('user')
@ApiTags('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('update')
  @ApiOperation({ summary: '更新用户信息' })
  @UseGuards(RegisteredUserAuthGuard)
  @ApiBearerAuth()
  async update(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    body: UpdateUserDto,
    @Req() req: Request,
  ) {
    return await this.userService.updateInfo(body, req);
  }

  @Get('queryAll')
  @ApiOperation({ summary: '查询所有用户' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async queryAll(@Query() query: QueryAllUserDto, @Req() req: Request) {
    return await this.userService.queryAll(query, req);
  }

  @Post('updateStatus')
  @ApiOperation({ summary: '更新用户状态' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async updateStatus(@Body() body: UpdateUserStatusDto) {
    return await this.userService.updateStatus(body);
  }

  @Post('resetUserPass')
  @ApiOperation({ summary: '重置用户密码' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async resetUserPass(@Body() body: ResetUserPassDto) {
    return await this.userService.resetUserPass(body);
  }
}
