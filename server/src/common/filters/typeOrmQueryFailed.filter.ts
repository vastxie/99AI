import { Catch, ArgumentsHost, ExceptionFilter, BadRequestException, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { getErrorStack } from '../utils/error-stack.util';

@Catch(QueryFailedError)
export class TypeOrmQueryFailedFilter implements ExceptionFilter {
  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    if ((exception as any).code === 'ER_DUP_ENTRY') {
      throw new BadRequestException('该记录已经存在，请勿重复添加！');
    } else {
      Logger.error(
        `数据库查询失败: ${exception.message}`,
        getErrorStack(exception),
        'TypeOrmQueryFailedFilter',
      );
    }

    response.status(500).json({
      statusCode: 500,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: '数据库查询失败', // 不回显驱动错误细节（表名/列名/SQL），详情见服务端日志
    });
  }
}
