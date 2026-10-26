import { Logger } from '@nestjs/common';

declare const beforeEach: any;
declare const jest: any;

beforeEach(() => {
  if (!jest.isMockFunction(Logger.debug)) {
    jest.spyOn(Logger, 'debug').mockImplementation((): undefined => undefined);
    return;
  }

  const debugMock = Logger.debug as any;
  debugMock.mockClear();
  debugMock.mockImplementation((): undefined => undefined);
});
