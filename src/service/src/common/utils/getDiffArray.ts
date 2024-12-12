export function getDiffArray(aLength: number, bLength: number, str: string): string[] {
	const a = Array.from({ length: aLength }, (_, i) => i + 1);
	const b = Array.from({ length: bLength }, (_, i) => i + 1);

	const diffArray: string[] = [];

	for (let i = 0; i < a.length; i++) {
		if (!b.includes(a[i])) {
			diffArray.push(`${str}${a[i]}`);
		}
	}

	return diffArray;
}
