import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'

type RouteContext = { params: Promise<{ id: string }> }

// PATCH /api/tasks/:id → ApiResponse<Task>
// Body: { title?, description?, due_date?, is_completed?, assignee_ids? }
// Authorization:
//   - creator or admin: full edit (any field)
//   - assignee (non-creator, non-admin): may only update is_completed
//   - anyone else: 403
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const member = await requireAuth()

  if (member instanceof NextResponse) return member

  const { id } = await params

  let body: {
    title?: string
    description?: string
    due_date?: string
    is_completed?: boolean
    assignee_ids?: string[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  const { assignee_ids, is_completed, ...fields } = body

  const db = createServerClient()

  // Fetch task and current assignees to authorize
  const { data: existing, error: existingError } = await db
    .from('tasks')
    .select('*')
    .eq('id', id)
    .single()

  if (existingError || !existing) {
    return NextResponse.json({ data: null, error: 'Compito non trovato' }, { status: 404 })
  }

  const { data: assigneeRows } = await db
    .from('task_assignees')
    .select('member_id')
    .eq('task_id', id)

  const assigneeIds = (assigneeRows ?? []).map(
    (r: { member_id: string }) => r.member_id
  )

  const isCreator = existing.created_by === member.id
  const isAssignee = assigneeIds.includes(member.id)
  const isAdmin = member.is_admin === true

  if (!isCreator && !isAssignee && !isAdmin) {
    return NextResponse.json({ data: null, error: 'Accesso negato' }, { status: 403 })
  }

  // Assignees who are not creator/admin may only update `is_completed`.
  // Any attempt to change other fields (title/description/due_date/assignee_ids)
  // is forbidden for them.
  if (!isCreator && !isAdmin) {
    const triesToEditOtherField =
      fields.title !== undefined ||
      fields.description !== undefined ||
      fields.due_date !== undefined ||
      assignee_ids !== undefined
    if (triesToEditOtherField) {
      return NextResponse.json({ data: null, error: 'Accesso negato' }, { status: 403 })
    }
  }

  // Validate title if provided
  if (fields.title !== undefined) {
    const trimmed = fields.title.trim()
    if (trimmed.length === 0) {
      return NextResponse.json({ data: null, error: 'Titolo obbligatorio' }, { status: 400 })
    }
  }

  const updatePayload: Record<string, unknown> = {}
  if (fields.title !== undefined) updatePayload.title = fields.title.trim()
  if (fields.description !== undefined) updatePayload.description = fields.description
  if (fields.due_date !== undefined) updatePayload.due_date = fields.due_date

  if (is_completed === true) {
    updatePayload.is_completed = true
    updatePayload.completed_by = member.id
    updatePayload.completed_at = new Date().toISOString()
  } else if (is_completed === false) {
    updatePayload.is_completed = false
    updatePayload.completed_by = null
    updatePayload.completed_at = null
  }

  let task
  if (Object.keys(updatePayload).length > 0) {
    const { data, error } = await db
      .from('tasks')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single()

    if (error || !data) {
      return NextResponse.json({ data: null, error: error?.message ?? 'Aggiornamento fallito' }, { status: 500 })
    }
    task = data
  } else {
    task = existing
  }

  if (assignee_ids !== undefined) {
    await db.from('task_assignees').delete().eq('task_id', id)
    if (assignee_ids.length > 0) {
      await db.from('task_assignees').insert(
        assignee_ids.map((mid) => ({ task_id: id, member_id: mid }))
      )
    }
  }

  const [{ data: assignees }, { data: creator }] = await Promise.all([
    db
      .from('task_assignees')
      .select('member_id, members(id, name, avatar_emoji, color)')
      .eq('task_id', id),
    db
      .from('members')
      .select('id, name, avatar_emoji, color')
      .eq('id', task.created_by)
      .single(),
  ])

  return NextResponse.json({ data: { ...task, assignees: assignees ?? [], creator: creator ?? null }, error: null })
}

// DELETE /api/tasks/:id → ApiResponse<null>
// Authorization: only creator or admin can delete.
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const member = await requireAuth()

  if (member instanceof NextResponse) return member

  const { id } = await params
  const db = createServerClient()

  // Fetch task to check authorization
  const { data: task, error: fetchError } = await db
    .from('tasks')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !task) {
    return NextResponse.json({ data: null, error: 'Compito non trovato' }, { status: 404 })
  }

  // Check authorization: must be creator or admin
  if (task.created_by !== member.id && !member.is_admin) {
    return NextResponse.json({ data: null, error: 'Accesso negato' }, { status: 403 })
  }

  const { error } = await db.from('tasks').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: null, error: null })
}
