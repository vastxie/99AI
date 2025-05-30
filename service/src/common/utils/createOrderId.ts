import { v1 as uuidv1 } from 'uuid';

export function createOrderId(): string {
  return uuidv1().toString().replace(/-/g, '');
}
