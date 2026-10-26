import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { RegisteredUserAuthGuard } from '@/common/auth/registeredUserAuth.guard';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { Request } from 'express';
import { BuyDto } from './dto/buy.dto';
import { QueryByOrderIdDto } from './dto/queryByOrder.dto';
import { QueryAllOrderDto } from './dto/queryAllOrder.dto';

@ApiTags('Order')
@Controller('order')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
  }),
)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post('buy')
  @ApiOperation({ summary: '购买商品' })
  @UseGuards(RegisteredUserAuthGuard)
  @ApiBearerAuth()
  async buy(@Body() body: BuyDto, @Req() req: Request) {
    return this.orderService.buy(body, req);
  }

  /* 查询订单状态 */
  @Get('queryByOrderId')
  @ApiOperation({ summary: '查询订单' })
  @UseGuards(RegisteredUserAuthGuard)
  @ApiBearerAuth()
  async queryByOrderId(@Req() req: Request, @Query() query: QueryByOrderIdDto) {
    return this.orderService.queryByOrderId(req, query);
  }

  /* 查询所有订单 */
  @Get('queryAll')
  @ApiOperation({ summary: '查询所有订单' })
  @UseGuards(SuperAuthGuard)
  async queryAllOrder(@Query() query: QueryAllOrderDto) {
    return this.orderService.queryAllOrder(query);
  }

  /* 删除订单 */
  @Post('delete')
  @ApiOperation({ summary: '删除订单' })
  @UseGuards(SuperAuthGuard)
  async deleteOrder(@Body() body: QueryByOrderIdDto) {
    return this.orderService.deleteOrder(body);
  }

  /* 删除未支付订单 */
  @Post('deleteNotPay')
  @ApiOperation({ summary: '删除未支付订单' })
  @UseGuards(SuperAuthGuard)
  async deleteNotPay() {
    return this.orderService.deleteNotPay();
  }
}
