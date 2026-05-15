export type Member = {
  id: string
  name: string
  avatar_emoji: string | null
  avatar_url: string | null
  family_role: string
  bio: string
  pin_hash: string
  is_admin: boolean
  is_active: boolean
  color: string
  notify_push: boolean
  notify_telegram: boolean
  telegram_chat_id: string | null
  created_at: string
  updated_at: string
}

export type MemberPublic = {
  id: string
  name: string
  avatar_emoji: string | null
  avatar_url: string | null
  family_role: string
  bio: string
  is_admin: boolean
  is_active: boolean
  color: string
}

/**
 * MemberPublic esteso con le preferenze di notifica personali. Esposto
 * solo a se stessi o agli admin: contiene `telegram_chat_id` che è un
 * identificatore privato del canale Telegram personale.
 *
 * Usato nelle GET/PATCH di /api/members/:id quando il caller è
 * isSelf || isAdmin — vedi `toSelfMember` in lib/auth.ts.
 */
export type MemberSelf = MemberPublic & {
  notify_push: boolean
  notify_telegram: boolean
  telegram_chat_id: string | null
}

export type Session = {
  id: string
  member_id: string
  token: string
  expires_at: string
  created_at: string
}

export type Post = {
  id: string
  author_id: string
  text: string
  post_type: 'normal' | 'recipe' | 'story'
  created_at: string
  updated_at: string
}

export type PostWithDetails = Post & {
  author: MemberPublic
  images: PostImage[]
  likes: PostLike[]
  comments_count: number
  liked_by_me: boolean
  bookmarked_by_me: boolean
  reactions: PostReactionWithMember[]
  poll: PostPollWithResults | null
}

export type PostBookmark = {
  id: string
  post_id: string
  member_id: string
  created_at: string
}

export type PostPoll = {
  id: string
  post_id: string
  question: string
  multi_choice: boolean
  closes_at: string | null
  created_at: string
}

export type PostPollOption = {
  id: string
  poll_id: string
  label: string
  sort_order: number
  created_at: string
}

export type PostPollVote = {
  id: string
  poll_id: string
  option_id: string
  member_id: string
  created_at: string
}

export type PostPollOptionWithResults = PostPollOption & {
  vote_count: number
  voted_by_me: boolean
}

export type PostPollWithResults = PostPoll & {
  options: PostPollOptionWithResults[]
  total_votes: number
  is_closed: boolean
}

export type PostImage = {
  id: string
  post_id: string
  image_url: string
  sort_order: number
  created_at: string
}

export type PostLike = {
  id: string
  post_id: string
  member_id: string
  created_at: string
}

export type PostComment = {
  id: string
  post_id: string
  author_id: string
  text: string
  created_at: string
}

export type PostCommentWithAuthor = PostComment & {
  author: MemberPublic
}

export const REACTION_EMOJIS = ['❤️', '😄', '👏'] as const
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number]

export type PostReaction = {
  id: string
  post_id: string
  member_id: string
  emoji: ReactionEmoji
  created_at: string
}

export type PostReactionWithMember = PostReaction & {
  member: MemberPublic
}

export type Activity = {
  id: string
  title: string
  icon: string
  color: string
  day_of_week: number
  time: string
  location: string
  notes: string
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ActivityWithDetails = Activity & {
  participants: MemberPublic[]
  roles: ActivityRole[]
  attendances: ActivityAttendance[]
  /** @deprecated Replaced by `attendances`. Always null on responses
   * from the current API; kept temporarily so old client builds don't crash. */
  weekly_status: ActivityWeeklyStatus | null
}

export type ActivityRole = {
  id: string
  activity_id: string
  member_id: string
  role_label: string
  member?: MemberPublic
}

export type AttendanceStatus = 'confirmed' | 'skipped' | 'modified'

export type ActivityAttendance = {
  id: string
  activity_id: string
  week_start: string
  member_id: string
  status: AttendanceStatus
  modified_notes: string | null
  created_at: string
  updated_at: string
}

/** @deprecated Use ActivityAttendance instead. */
export type ActivityWeeklyStatus = {
  id: string
  activity_id: string
  week_start: string
  status: 'pending' | 'confirmed' | 'skipped' | 'modified'
  confirmed_by: string | null
  modified_notes: string | null
  created_at: string
  updated_at: string
}

export type CalendarEvent = {
  id: string
  title: string
  icon: string
  color: string
  event_date: string
  event_time: string | null
  location: string
  notes: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CalendarEventWithDetails = CalendarEvent & {
  participants: MemberPublic[]
}

export type Task = {
  id: string
  title: string
  notes: string
  is_completed: boolean
  completed_by: string | null
  completed_at: string | null
  linked_event_id: string | null
  linked_activity_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type TaskWithDetails = Task & {
  assignees: MemberPublic[]
  creator: MemberPublic | null
}

export type ChatGroup = {
  id: string
  name: string
  is_direct: boolean
  icon: string
  created_by: string | null
  created_at: string
}

export type ChatGroupWithDetails = ChatGroup & {
  members: MemberPublic[]
  last_message: ChatMessage | null
  unread_count: number
}

export type ChatMessage = {
  id: string
  group_id: string
  author_id: string
  text: string
  message_type: 'text' | 'image' | 'document'
  media_url: string | null
  created_at: string
  /** Messaggio citato in stile WhatsApp. NULL = non è una reply. */
  reply_to_message_id: string | null
  /** NULL = mai modificato. Quando settato, la UI mostra "Modificato". */
  edited_at: string | null
  /** NULL = non eliminato. Quando settato, il server sostituisce `text`
   * con "[Messaggio eliminato]" prima di rispondere — la riga resta per
   * mantenere il contesto delle reply che la citano. */
  deleted_at: string | null
}

/** Citazione minima embedded nel messaggio che fa reply. Costruita lato
 * server con un self-join su chat_messages + author. Vale `null` se
 * `reply_to_message_id` è NULL o se il messaggio citato è stato
 * hard-deleted (la FK ON DELETE SET NULL setta reply_to_message_id a NULL
 * nei messaggi citanti). Se il messaggio citato ha `deleted_at` non-NULL,
 * `text` qui sotto è già stato sostituito dal server con "[Messaggio
 * eliminato]". */
export type ChatMessageReplyRef = {
  id: string
  text: string
  author: { id: string; name: string; color: string }
}

export type ChatMessageWithAuthor = ChatMessage & {
  author: MemberPublic
  reply_to: ChatMessageReplyRef | null
}

export type ChatReadStatus = {
  id: string
  group_id: string
  member_id: string
  last_read_at: string
}

export type Album = {
  id: string
  name: string
  cover_image_url: string | null
  created_by: string | null
  created_at: string
}

export type AlbumWithDetails = Album & {
  photo_count: number
  creator: MemberPublic | null
}

export type AlbumPhoto = {
  id: string
  album_id: string
  image_url: string
  caption: string
  uploaded_by: string | null
  post_id: string | null
  created_at: string
}

export type Notification = {
  id: string
  member_id: string
  type:
    | 'activity_reminder'
    | 'new_event'
    | 'new_activity'
    | 'task_assigned'
    | 'new_post'
    | 'new_comment'
    | 'new_reaction'
    | 'chat_message'
  title: string
  body: string
  link: string | null
  is_read: boolean
  sent_push: boolean
  sent_telegram: boolean
  created_at: string
}

export type PushSubscription = {
  id: string
  member_id: string
  endpoint: string
  keys_p256dh: string
  keys_auth: string
  created_at: string
}

export type AppConfig = {
  key: string
  value: string
  updated_at: string
}

// --- Input types ---

export type CreateMemberInput = {
  name: string
  avatar_emoji?: string
  family_role: string
  pin: string
  bio?: string
  color?: string
  is_admin?: boolean
}

export type UpdateMemberInput = {
  name?: string
  avatar_emoji?: string
  avatar_url?: string
  family_role?: string
  bio?: string
  color?: string
  is_admin?: boolean
  is_active?: boolean
  notify_push?: boolean
  notify_telegram?: boolean
  telegram_chat_id?: string
}

export type CreatePostInput = {
  text: string
  post_type?: 'normal' | 'recipe' | 'story'
  images?: File[]
  poll?: CreatePollInput
}

export type CreatePollInput = {
  question: string
  options: string[]
  multi_choice?: boolean
  closes_at?: string | null
}

export type CreateActivityInput = {
  title: string
  icon?: string
  color?: string
  day_of_week: number
  time: string
  location?: string
  notes?: string
  participant_ids: string[]
  roles?: { member_id: string; role_label: string }[]
}

export type UpdateActivityInput = {
  title?: string
  icon?: string
  color?: string
  day_of_week?: number
  time?: string
  location?: string
  notes?: string
  participant_ids?: string[]
  roles?: { member_id: string; role_label: string }[]
}

/** @deprecated Use SetAttendanceInput. Kept temporarily for compatibility. */
export type SetWeeklyStatusInput = {
  status: 'confirmed' | 'skipped' | 'modified' | 'pending'
  modified_notes?: string
}

export type SetAttendanceInput = {
  week_start: string
  status: AttendanceStatus
  modified_notes?: string
}

export type CreateEventInput = {
  title: string
  icon?: string
  color?: string
  event_date: string
  event_time?: string
  location?: string
  notes?: string
  participant_ids?: string[]
}

export type UpdateEventInput = {
  title?: string
  icon?: string
  color?: string
  event_date?: string
  event_time?: string | null
  location?: string
  notes?: string
  participant_ids?: string[]
}

export type CreateTaskInput = {
  title: string
  notes?: string
  assignee_ids?: string[]
  linked_event_id?: string
  linked_activity_id?: string
}

export type UpdateTaskInput = {
  title?: string
  notes?: string
  is_completed?: boolean
  assignee_ids?: string[]
}

export type CreateChatGroupInput = {
  name: string
  member_ids: string[]
  is_direct?: boolean
  icon?: string
}

export type SendMessageInput = {
  text?: string
  message_type?: 'text' | 'image' | 'document'
  media_url?: string
  reply_to_message_id?: string | null
}

export type UpdateMessageInput = {
  text: string
}

export type LoginInput = {
  member_id: string
  pin: string
}

export type SetupInput = {
  name: string
  pin: string
  avatar_emoji?: string
  family_role?: string
}

export type OfflineOperation = {
  id: string
  type: 'create_post' | 'toggle_like' | 'add_comment'
  payload: Record<string, unknown>
  created_at: string
  status: 'pending' | 'syncing' | 'failed'
  retries: number
}

export type ApiResponse<T> = {
  data: T | null
  error: string | null
}

export type PaginatedResponse<T> = {
  data: T[]
  total: number
  page: number
  per_page: number
  has_more: boolean
}
