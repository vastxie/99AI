export function isNotEmptyString(value: any): boolean {
	return typeof value === 'string' && value.length > 0;
}

// ===  await eval('import("module")');
export const importDynamic = new Function('modulePath', 'return import(modulePath)');
