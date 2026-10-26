import { stringifyFrontendMessage } from './tool-result-payload';

type FrontendSanitizeOptions = {
  exposePrivateFileDownloads?: boolean;
};

export function sanitizeChatLogMessageForFrontend(
  message?: unknown,
  options: FrontendSanitizeOptions = {},
): string {
  return message === undefined || message === null || message === ''
    ? ''
    : stringifyFrontendMessage(message, options);
}

export function sanitizeChatLogItemForFrontend<T extends { message?: unknown }>(
  item: T,
  options: FrontendSanitizeOptions = {},
): T & { message: string } {
  return {
    ...item,
    message: sanitizeChatLogMessageForFrontend(item.message, options),
  } as T & { message: string };
}
