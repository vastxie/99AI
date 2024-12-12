export function maskEmail(email: string): string {
	if (!email) return '';
	const atIndex = email.indexOf('@');
	if (atIndex <= 1) {
		return email;
	}
	const firstPart = email.substring(0, atIndex - 1);
	const lastPart = email.substring(atIndex);
	const maskedPart = '*'.repeat(firstPart.length - 1);
	return `${firstPart.charAt(0)}${maskedPart}${email.charAt(atIndex - 1)}${lastPart}`;
}
