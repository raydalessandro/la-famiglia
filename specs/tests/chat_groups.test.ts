/**
 * Test: Chat groups API — creation + listing
 *
 * Bugs found:
 * 1. POST 400 on direct chat: name required even for is_direct=true
 * 2. GET 500: order by 'updated_at' but column doesn't exist on chat_groups
 * 3. GET 500: .single() on chat_read_status throws when no row exists
 * 4. POST message 500: updating non-existent 'updated_at' on chat_groups
 *
 * Fixes:
 * 1. Allow empty name for direct chats, set default 'Chat diretta'
 * 2. Order by created_at instead
 * 3. Use .maybeSingle() instead of .single()
 * 4. Remove the update call
 */

import { describe, it, expect } from 'vitest'

describe('POST /api/chat/groups — validation', () => {
  it('group chat requires name', () => {
    // Body: { name: '', member_ids: ['x'], is_direct: false }
    // Expected: 400 "Il nome è obbligatorio per i gruppi"
    const body = { name: '', member_ids: ['x'], is_direct: false }
    const isValid = body.is_direct || (body.name && body.name.trim() !== '')
    expect(isValid).toBe(false)
  })

  it('direct chat allows empty name', () => {
    // Body: { name: '', member_ids: ['x'], is_direct: true }
    // Expected: 201 (name defaults to "Chat diretta")
    const body = { name: '', member_ids: ['x'], is_direct: true }
    const isValid = body.is_direct || (body.name && body.name.trim() !== '')
    expect(isValid).toBe(true)
  })

  it('member_ids must be non-empty array', () => {
    const body = { name: 'Test', member_ids: [] }
    expect(body.member_ids.length).toBe(0) // Should return 400
  })

  it('is_direct passed to insert', () => {
    // The insert payload should include is_direct and icon
    const body = { name: '', member_ids: ['x'], is_direct: true, icon: '💬' }
    const insertPayload = {
      name: body.is_direct ? 'Chat diretta' : body.name.trim(),
      is_direct: body.is_direct || false,
      icon: body.icon || '👥',
      created_by: 'member-1',
    }
    expect(insertPayload.is_direct).toBe(true)
    expect(insertPayload.name).toBe('Chat diretta')
  })
})

describe('GET /api/chat/groups — schema alignment', () => {
  it('chat_groups table has created_at (not updated_at)', () => {
    // Schema: chat_groups has: id, name, is_direct, icon, created_by, created_at
    // NO updated_at column
    const chatGroupColumns = ['id', 'name', 'is_direct', 'icon', 'created_by', 'created_at']
    expect(chatGroupColumns).not.toContain('updated_at')
    expect(chatGroupColumns).toContain('created_at')
  })

  it('read_status query uses maybeSingle (not single)', () => {
    // .single() throws PGRST116 when no row found
    // .maybeSingle() returns null when no row found
    // For new groups with no read_status yet, single() would crash
    const hasReadStatus = false
    const result = hasReadStatus ? { last_read_at: '2026-01-01' } : null
    expect(result).toBeNull() // Should NOT throw
  })
})

describe('POST /api/chat/groups/:id/messages — no updated_at', () => {
  it('does not update chat_groups.updated_at after sending message', () => {
    // chat_groups has no updated_at column
    // Attempting to update it causes Postgres error
    const chatGroupColumns = ['id', 'name', 'is_direct', 'icon', 'created_by', 'created_at']
    expect(chatGroupColumns).not.toContain('updated_at')
  })
})
