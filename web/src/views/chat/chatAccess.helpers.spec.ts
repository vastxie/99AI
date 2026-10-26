import { describe, expect, it } from 'vitest'
import { isAuthenticatedChatUser } from './chatAccess.helpers'

describe('isAuthenticatedChatUser', () => {
  it('treats a visitor token or a missing role as unauthenticated', () => {
    expect(isAuthenticatedChatUser({ token: 'visitor-token', role: 'visitor' })).toBe(false)
    expect(isAuthenticatedChatUser({ token: 'user-token' })).toBe(false)
    expect(isAuthenticatedChatUser({ token: '', role: 'user' })).toBe(false)
  })

  it('accepts a real user token regardless of role casing', () => {
    expect(isAuthenticatedChatUser({ token: 'user-token', role: 'user' })).toBe(true)
    expect(isAuthenticatedChatUser({ token: 'user-token', role: ' Admin ' })).toBe(true)
  })
})
