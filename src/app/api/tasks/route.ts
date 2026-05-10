import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { notifyMembers } from '@/lib/notifications'

// GET /api/tasks?assignee_id=xxx&completed=false → ApiResponse<Task[]>
export async function GET(req: NextRequest) {
  const auth = await requireAuth()

  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const assigneeId = searchParams.get('assignee_id')
  const completedParam = searchParams.get('completed')

  const db = createServerClient()

  let taskIds: string[] | null = null
  if (assigneeId) {
    const { data: assignments } = await db
      .from('task_assignees')
      .select('task_id')
      .eq('member_id', assigneeId)
    taskIds = (assignments ?? []).map((a: { task_id: string }) => a.task_id)
  }

  let query = db.from('tasks').select('*')

  if (taskIds !== null) {
    if (taskIds.length === 0) {
      return NextResponse.json({ data: [], error: null })
    }
    query = query.in('id', taskIds)
  }

  if (completedParam !== null) {
    query = query.eq('is_completed', completedParam === 'true')
  }

  const { data: tasks, error } = await query.order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  const enriched = await Promise.all(
    (tasks ?? []).map(async (task) => {
      const [{ data: assignees }, { data: creator }] = await Promise.all([
        db
          .from('task_assignees')
          .select('member_id, members(id, name, avatar_emoji, color)')
          .eq('task_id', task.id),
        db
          .from('members')
          .select('id, name, avatar_emoji, color')
          .eq('id', task.created_by)
          .single(),
      ])
      return { ...task, assignees: assignees ?? [], creator: creator ?? null }
    })
  )

  return NextResponse.json({ data: enriched, error: null })
}

// POST /api/tasks → 201 ApiResponse<Task>
// Body: { title, description?, due_date?, assignee_ids? }
export async function POST(req: NextRequest) {
  const member = await requireAuth()

  if (member instanceof NextResponse) return member

  let body: {
    title: string
    description?: string
    due_date?: string
    assignee_ids?: string[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  const { title, description, due_date, assignee_ids } = body

  if (!title || title.trim() === '') {
    return NextResponse.json({ data: null, error: 'Il titolo è obbligatorio' }, { status: 400 })
  }

  const db = createServerClient()
  const { data: task, error } = await db
    .from('tasks')
    .insert({
      title: title.trim(),
      description: description ?? null,
      due_date: due_date ?? null,
      created_by: member.id,
      is_completed: false,
    })
    .select('*')
    .single()

  if (error || !task) {
    return NextResponse.json({ data: null, error: error?.message ?? 'Creazione fallita' }, { status: 500 })
  }

  const assigneeIds = assignee_ids ?? []
  if (assigneeIds.length > 0) {
    await db.from('task_assignees').insert(
      assigneeIds.map((mid) => ({ task_id: task.id, member_id: mid }))
    )

    await notifyMembers(
      assigneeIds.filter((id) => id !== member.id),
      'task_assigned',
      `Nuovo compito: ${task.title}`,
      `Ti è stato assegnato un nuovo compito`,
      `/tasks/${task.id}`
    )
  }

  return NextResponse.json({ data: { ...task, assignees: assigneeIds }, error: null }, { status: 201 })
}
