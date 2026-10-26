import { Injectable, Logger } from '@nestjs/common';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from '../order/order.entity';
import { PayService } from './pay.service';
import { PaymentCallbackService } from './payment-callback.service';
import { PaymentProvider } from './payment.types';

@Injectable()
export class PaymentPollingService {
  private pollingTasks: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private readonly payService: PayService,
    private readonly callbackService: PaymentCallbackService,
    @InjectRepository(OrderEntity)
    private readonly orderEntity: Repository<OrderEntity>,
  ) {}

  /** 启动分阶段轮询 */
  startPolling(orderId: string) {
    if (this.pollingTasks.has(orderId)) {
      clearTimeout(this.pollingTasks.get(orderId));
      this.pollingTasks.delete(orderId);
    }

    const startTime = Date.now();

    const poll = async () => {
      const elapsed = Date.now() - startTime;

      Logger.debug('下单后轮询查单', 'PaymentPollingService');

      try {
        const order = await this.orderEntity.findOne({ where: { orderId } });
        if (!order || order.status !== 0) {
          this.stopPolling(orderId);
          return;
        }

        // 按订单自己的渠道取适配器（渠道之后下线也照样查）；查单结果与补单任务走同一个入账入口
        const provider = order.payPlatform as PaymentProvider;
        const adapter = this.payService.getProvider(provider);
        if (adapter?.queryOrder) {
          const result = await adapter.queryOrder({ orderId, tradeId: order.tradeId });
          if (result.state === 'paid') {
            const outcome = await this.callbackService.processQueryResult(result, {
              requestedOrderId: orderId,
              provider,
            });
            // 字段或订单不符（rejected）按无法确认处理，继续轮询；入账了、已支付或不再待支付才停止
            if (outcome !== 'rejected') {
              this.stopPolling(orderId);
              return;
            }
          }
          if (result.state === 'closed') {
            // 渠道已关闭：不改订单状态，只停止本轮短轮询
            Logger.log('下单后轮询查到渠道已关闭，停止轮询', 'PaymentPollingService');
            this.stopPolling(orderId);
            return;
          }
        }

        let nextInterval: number;
        if (elapsed < 30 * 1000) {
          nextInterval = 1000;
        } else if (elapsed < 2 * 60 * 1000) {
          nextInterval = 3000;
        } else if (elapsed < 5 * 60 * 1000) {
          nextInterval = 5000;
        } else {
          this.stopPolling(orderId);
          return;
        }

        const pollTask = setTimeout(() => poll(), nextInterval);
        this.pollingTasks.set(orderId, pollTask);
      } catch (error) {
        Logger.error('订单轮询查询失败', getErrorStack(error), 'PaymentPollingService');

        const currentElapsed = Date.now() - startTime;
        if (currentElapsed >= 5 * 60 * 1000) {
          this.stopPolling(orderId);
          return;
        }

        const pollTask = setTimeout(() => poll(), 3000);
        this.pollingTasks.set(orderId, pollTask);
      }
    };

    void poll();
  }

  /** 停止轮询 */
  stopPolling(orderId: string) {
    const task = this.pollingTasks.get(orderId);
    if (task) {
      clearTimeout(task);
      this.pollingTasks.delete(orderId);
    }
  }
}
