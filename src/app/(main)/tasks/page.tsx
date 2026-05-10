'use client'

import { useState, useMemo } from 'react'
import { useTasks } from '@/hooks/useTasks'
import { useAuth } from '@/hooks/useAuth'
import { useMembers } from '@/hooks/useMembers'
import { BottomSheet, ParticipantPicker, Avatar, MiniAvatarStack, Button, Skeleton } from '@/components/ui'
import { CreateTaskInput, TaskWithDetails } from '@/types/database'

type FilterTab = 'all' | 'mine' | 'completed'

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'Tutti' },
  { key: 'mine', label: 'I miei' },
  { key: 'completed', label: 'Completati' },
]

function TaskRow({
  task,
  onToggle,
}: {
  task: TaskWithDetails
  onToggle: (id: string) => void
}) {
  // Stripe = identity colour of the first assignee (fallback creator/accent).
  // Cozi-style colour-per-member at a glance: "ah, è di Marco".
  const stripeColor =
    task.assignees[0]?.color || task.creator?.color || '#E8A838'

  return (
    <div
      className={`flex items-start gap-3 bg-surface-raised rounded-card px-4 py-3.5 border border-white/5 transition-opacity ${
        task.is_completed ? 'opacity-50' : ''
      }`}
      style={{ borderLeft: `3px solid ${stripeColor}` }}
    >
      {/* Checkbox — 24px visual, 44px tappable area via negative margin trick.
       * Apple HIG / Material accessible target floor is 44pt; for older
       * users we want the tappable surface comfortably above that. */}
      <button
        onClick={() => onToggle(task.id)}
        className="shrink-0 -m-2.5 p-2.5 flex items-center justify-center transition-all"
        aria-label={task.is_completed ? 'Segna come da fare' : 'Segna come completato'}
      >
        <span
          className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
          style={{
            borderColor: task.is_completed ? '#E8A838' : 'rgba(255,255,255,0.2)',
            backgroundColor: task.is_completed ? '#E8A838' : 'transparent',
          }}
        >
          {task.is_completed && (
            <svg className="w-4 h-4 text-[#1a1a2e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-body font-medium ${
            task.is_completed ? 'line-through text-white/30' : 'text-white'
          }`}
        >
          {task.title}
        </p>
        {task.notes && !task.is_completed && (
          <p className="text-white/40 text-xs mt-1 line-clamp-2">{task.notes}</p>
        )}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {task.assignees.length > 0 && (
            <MiniAvatarStack members={task.assignees} max={3} />
          )}
          {task.linked_event_id && (
            <span className="flex items-center gap-1 text-xs text-blue-300 bg-blue-500/10 rounded-full px-2 py-0.5 border border-blue-500/20">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Evento
            </span>
          )}
          {task.linked_activity_id && (
            <span className="flex items-center gap-1 text-xs text-purple-300 bg-purple-500/10 rounded-full px-2 py-0.5 border border-purple-500/20">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Attività
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const DEFAULT_FORM: Omit<CreateTaskInput, 'title'> & { title: string } = {
  title: '',
  notes: '',
  assignee_ids: [],
  linked_event_id: undefined,
  linked_activity_id: undefined,
}

export default function TasksPage() {
  const { member } = useAuth()
  const { tasks, isLoading, createTask, toggleComplete } = useTasks()
  const { members } = useMembers()

  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState({ ...DEFAULT_FORM })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const filteredTasks = useMemo(() => {
    switch (activeTab) {
      case 'mine':
        return tasks.filter(
          (t) => !t.is_completed && t.assignees.some((a) => a.id === member?.id)
        )
      case 'completed':
        return tasks.filter((t) => t.is_completed)
      default:
        return tasks.filter((t) => !t.is_completed)
    }
  }, [tasks, activeTab, member?.id])

  const completedCount = useMemo(() => tasks.filter((t) => t.is_completed).length, [tasks])
  const totalCount = tasks.length

  const handleCreate = async () => {
    if (!form.title.trim()) return
    setIsSubmitting(true)
    const ok = await createTask({
      title: form.title.trim(),
      notes: form.notes,
      assignee_ids: form.assignee_ids,
    })
    setIsSubmitting(false)
    if (ok) {
      setSheetOpen(false)
      setForm({ ...DEFAULT_FORM })
    }
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#1a1a2e]/90 backdrop-blur border-b border-white/5">
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-white">Compiti</h1>
          {totalCount > 0 && (
            <span className="text-xs text-white/40 bg-white/5 rounded-full px-3 py-1">
              {completedCount}/{totalCount}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="px-4 pb-3">
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#E8A838] rounded-full transition-all duration-500"
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 px-4 pb-3">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-[#E8A838] text-[#1a1a2e]'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div className="px-4 py-4 flex flex-col gap-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-card" />
          ))
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-5xl mb-4">
              {activeTab === 'completed' ? '🎉' : '✅'}
            </span>
            <p className="text-white/60 text-base">
              {activeTab === 'completed'
                ? 'Nessun compito completato.'
                : activeTab === 'mine'
                ? 'Nessun compito assegnato a te.'
                : 'Nessun compito da fare!'}
            </p>
            {activeTab !== 'completed' && (
              <p className="text-white/40 text-sm mt-1">Aggiungine uno con il + in basso.</p>
            )}
          </div>
        ) : (
          filteredTasks.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={toggleComplete} />
          ))
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-24 right-5 z-30 w-14 h-14 rounded-full bg-[#E8A838] shadow-lg shadow-[#E8A838]/30 flex items-center justify-center text-[#1a1a2e] text-2xl font-bold hover:bg-[#E8A838]/90 active:scale-95 transition-all"
        aria-label="Nuovo compito"
      >
        +
      </button>

      {/* Create task sheet */}
      <BottomSheet isOpen={sheetOpen} onClose={() => { setSheetOpen(false); setForm({ ...DEFAULT_FORM }) }} title="Nuovo compito">
        <div className="flex flex-col gap-4 pt-2">
          {/* Title */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Titolo *</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Cosa c'è da fare?"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#E8A838]/60"
              autoFocus
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Note</label>
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Dettagli aggiuntivi..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm resize-none focus:outline-none focus:border-[#E8A838]/60"
            />
          </div>

          {/* Assignees */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Assegna a</label>
            <ParticipantPicker
              members={members}
              selected={form.assignee_ids ?? []}
              onChange={(ids) => setForm((f) => ({ ...f, assignee_ids: ids }))}
            />
          </div>

          {/* Quick assign to me */}
          {member && (
            <button
              onClick={() => {
                const alreadyAssigned = (form.assignee_ids ?? []).includes(member.id)
                setForm((f) => ({
                  ...f,
                  assignee_ids: alreadyAssigned
                    ? (f.assignee_ids ?? []).filter((id) => id !== member.id)
                    : [...(f.assignee_ids ?? []), member.id],
                }))
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all self-start ${
                (form.assignee_ids ?? []).includes(member.id)
                  ? 'border-[#E8A838] bg-[#E8A838]/10 text-[#E8A838]'
                  : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              <Avatar
                emoji={member.avatar_emoji}
                url={member.avatar_url}
                name={member.name}
                size="sm"
                color={member.color}
              />
              Assegna a me
            </button>
          )}

          <Button
            onClick={handleCreate}
            disabled={!form.title.trim()}
            loading={isSubmitting}
            fullWidth
          >
            {isSubmitting ? 'Creando...' : 'Crea compito'}
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}
