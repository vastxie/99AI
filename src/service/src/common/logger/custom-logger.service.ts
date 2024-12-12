import { ConsoleLogger, Injectable } from '@nestjs/common';

@Injectable()
export class CustomLoggerService extends ConsoleLogger {
  private isDev: boolean;

  constructor() {
    super();
    this.isDev = process.env.ISDEV === 'TRUE';
  }

  log(message: string, context?: string) {
    super.log(message, context); // 在任何环境下都输出 log 级别日志
  }

  error(message: string, trace?: string, context?: string) {
    super.error(message, trace, context); // 在任何环境下都输出 error 级别日志
  }

  warn(message: string, context?: string) {
    if (this.isDev) {
      super.warn(message, context); // 仅在开发环境下输出 warn 级别日志
    }
  }

  debug(message: string, context?: string) {
    if (this.isDev) {
      super.debug(message, context); // 仅在开发环境下输出 debug 级别日志
    }
  }

  verbose(message: string, context?: string) {
    if (this.isDev) {
      super.verbose(message, context); // 仅在开发环境下输出 verbose 级别日志
    }
  }
}
