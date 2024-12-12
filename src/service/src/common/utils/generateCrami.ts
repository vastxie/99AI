import { v4 as uuidv4 } from 'uuid';

export function generateCramiCode(): string {
	const code = uuidv4().replace(/-/g, '').slice(0, 16);
	return code;
}
