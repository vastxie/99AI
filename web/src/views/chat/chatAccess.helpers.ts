export function isAuthenticatedChatUser(input: {
  token?: string | null
  role?: string | null
}): boolean {
  const role = String(input.role || '')
    .trim()
    .toLowerCase()
  return Boolean(input.token) && Boolean(role) && role !== 'visitor'
}
