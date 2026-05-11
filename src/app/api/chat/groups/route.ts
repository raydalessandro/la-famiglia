import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { MemberPublic } from '@/types/database'

// GET /api/chat/groups → ApiResponse<ChatGroup[]>
// Returns groups where the authenticated member is a participant
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_req: NextRequest) {
  const member = await requireAuth()

  if (member instanceof NextResponse) return member

  const db = createServerClient()

  // Get group IDs where member participates
  const { data: memberships, error: membershipError } = await db
    .from('chat_group_members')
    .select('group_id')
    .eq('member_id', member.id)

  if (membershipError) {
    return NextResponse.json({ data: null, error: membershipError.message }, { status: 500 })
  }

  const groupIds = (memberships ?? []).map((m: { group_id: string }) => m.group_id)

  if (groupIds.length === 0) {
    return NextResponse.json({ data: [], error: null })
  }

  const { data: groups, error: groupsError } = await db
    .from('chat_groups')
    .select('*')
    .in('id', groupIds)
    .order('created_at', { ascending: false })

  if (groupsError) {
    return NextResponse.json({ data: null, error: groupsError.message }, { status: 500 })
  }

  const enriched = await Promise.all(
    (groups ?? []).map(async (group) => {
      const [
        { data: groupMembers },
        { data: lastMessages },
        { data: readStatus },
      ] = await Promise.all([
        db
          .from('chat_group_members')
          .select('member_id, members(id, name, avatar_emoji, color)')
          .eq('group_id', group.id),
        db
          .from('chat_messages')
          .select('*')
          .eq('group_id', group.id)
          .order('created_at', { ascending: false })
          .limit(1),
        db
          .from('chat_read_status')
          .select('last_read_at')
          .eq('group_id', group.id)
          .eq('member_id', member.id)
          .maybeSingle(),
      ])

      const lastMessage = lastMessages?.[0] ?? null
      const lastReadAt = readStatus?.last_read_at ?? null

      let unreadCount = 0
      if (lastReadAt) {
        const { count } = await db
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', group.id)
          .gt('created_at', lastReadAt)
          .neq('author_id', member.id)
        unreadCount = count ?? 0
      }

      // Supabase nests the joined row under `members`. Flatten to the
      // MemberPublic[] shape the UI expects — otherwise direct-chat title
      // resolution (`other.name`) silently falls back to "Chat diretta".
      const flatMembers = (groupMembers ?? [])
        .map((row: { members: unknown }) => row.members as MemberPublic | null)
        .filter((m): m is MemberPublic => m !== null)

      return {
        ...group,
        members: flatMembers,
        last_message: lastMessage,
        unread_count: unreadCount,
      }
    })
  )

  return NextResponse.json({ data: enriched, error: null })
}

// POST /api/chat/groups → 201 ApiResponse<ChatGroup>
// Body: CreateChatGroupInput { name, member_ids, is_direct?, icon? }
export async function POST(req: NextRequest) {
  const member = await requireAuth()

  if (member instanceof NextResponse) return member

  let body: { name: string; member_ids: string[]; is_direct?: boolean; icon?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  const { name, member_ids, is_direct, icon } = body

  // For direct chats, name can be empty (UI shows other person's name)
  if (!is_direct && (!name || name.trim() === '')) {
    return NextResponse.json({ data: null, error: 'Il nome è obbligatorio per i gruppi' }, { status: 400 })
  }
  if (!member_ids || !Array.isArray(member_ids) || member_ids.length === 0) {
    return NextResponse.json({ data: null, error: 'Seleziona almeno un membro' }, { status: 400 })
  }

  const db = createServerClient()

  const { data: group, error } = await db
    .from('chat_groups')
    .insert({
      name: is_direct ? 'Chat diretta' : name.trim(),
      is_direct: is_direct || false,
      icon: icon || '👥',
      created_by: member.id,
    })
    .select('*')
    .single()

  if (error || !group) {
    return NextResponse.json({ data: null, error: error?.message ?? 'Creazione fallita' }, { status: 500 })
  }

  // Include creator in members if not already present
  const allMemberIds = Array.from(new Set([member.id, ...member_ids]))

  await db.from('chat_group_members').insert(
    allMemberIds.map((mid) => ({ group_id: group.id, member_id: mid }))
  )

  // Init read status for all members
  await db.from('chat_read_status').insert(
    allMemberIds.map((mid) => ({
      group_id: group.id,
      member_id: mid,
      last_read_at: new Date().toISOString(),
    }))
  )

  return NextResponse.json({ data: { ...group, members: allMemberIds }, error: null }, { status: 201 })
}
