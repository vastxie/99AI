import { Guid } from 'guid-typescript';

export function createRandomUid(): string {
  const uuid = Guid.create();
  return uuid.toString().substr(0, 10).replace('-', '');
}
