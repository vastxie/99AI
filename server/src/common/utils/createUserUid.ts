import { randomAlphanumeric } from './random-id';

const USER_UID_LENGTH = 12;

export function createUserUid(length = USER_UID_LENGTH): string {
  return randomAlphanumeric(length);
}
