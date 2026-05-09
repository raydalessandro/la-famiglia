import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'

// GET /api/notifications → ApiResponse<Notification[]>
// Returns notifications for the authenticated member, newest first
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_req: NextRequest) {
  let member
  try {
    member = await requireAuth()
  } catch (response) {
    return response as Response
  }

  const db = createServerClient()

  const { data: notifications, error } = await db
    .from('notifications')
    .select('*')
    .eq('member_id', member.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: notifications ?? [], error: null })
}

// PATCH /api/notifications → ApiResponse<null>
// Body: { notification_ids: string[] } | { all: true }
// Marks notifications as read
export async function PATCH(req: NextRequest) {
  let member
  try {
    member = await requireAuth()
  } catch (response) {
    return response as Response
  }

  let body: { notification_ids?: string[]; all?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  const db = createServerClient()
  const readAt = new Date().toISOString()

  if (body.all === true) {
    const { error } = await db
      .from('notifications')
      .update({ is_read: true, read_at: readAt })
      .eq('member_id', member.id)
      .eq('is_read', false)

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }
  } else if (Array.isArray(body.notification_ids) && body.notification_ids.length > 0) {
    // Security: scope by member_id to prevent marking other members' notifications
    const { error } = await db
      .from('notifications')
      .update({ is_read: true, read_at: readAt })
      .in('id', body.notification_ids)
      .eq('member_id', member.id)

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }
  } else {
    return NextResponse.json(
      { data: null, error: 'Fornire notification_ids o all: true' },
      { status: 400 }
    )
  }

  return NextResponse.json({ data: null, error: null })
}
