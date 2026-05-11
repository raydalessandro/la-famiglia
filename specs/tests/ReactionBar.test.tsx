import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReactionBar } from '../../src/components/ui/ReactionBar'
import type { PostReactionWithMember, MemberPublic } from '../../src/types/database'

const MARIA: MemberPublic = {
  id: 'maria-1',
  name: 'Maria',
  avatar_emoji: '👵',
  avatar_url: null,
  family_role: 'nonna',
  bio: '',
  is_admin: false,
  is_active: true,
  color: '#E8A838',
}

const GIORGIO: MemberPublic = {
  id: 'giorgio-1',
  name: 'Giorgio',
  avatar_emoji: '👴',
  avatar_url: null,
  family_role: 'nonno',
  bio: '',
  is_admin: false,
  is_active: true,
  color: '#4FC3F7',
}

function reaction(
  id: string,
  emoji: '❤️' | '😄' | '👏',
  member: MemberPublic,
): PostReactionWithMember {
  return {
    id,
    post_id: 'post-1',
    member_id: member.id,
    emoji,
    created_at: '2026-01-01T00:00:00Z',
    member,
  }
}

describe('<ReactionBar>', () => {
  it('renders one button per allowed emoji', () => {
    render(
      <ReactionBar
        postId="post-1"
        reactions={[]}
        currentMemberId={MARIA.id}
        onToggle={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: /❤️/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /😄/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /👏/ })).toBeInTheDocument()
  })

  it('shows the count for each emoji', () => {
    const reactions = [
      reaction('r1', '❤️', MARIA),
      reaction('r2', '❤️', GIORGIO),
      reaction('r3', '😄', GIORGIO),
    ]

    render(
      <ReactionBar
        postId="post-1"
        reactions={reactions}
        currentMemberId={MARIA.id}
        onToggle={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: /❤️/ })).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: /😄/ })).toHaveTextContent('1')
    // 👏 has no reactions → count must not show a number
    expect(screen.getByRole('button', { name: /👏/ })).not.toHaveTextContent(/[0-9]/)
  })

  it('marks an emoji as picked-by-me when current member has reacted with it', () => {
    const reactions = [reaction('r1', '😄', MARIA)]

    render(
      <ReactionBar
        postId="post-1"
        reactions={reactions}
        currentMemberId={MARIA.id}
        onToggle={() => undefined}
      />,
    )

    const heart = screen.getByRole('button', { name: /❤️/ })
    const laugh = screen.getByRole('button', { name: /😄/ })

    expect(laugh).toHaveAttribute('aria-pressed', 'true')
    expect(heart).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onToggle with the clicked emoji', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()

    render(
      <ReactionBar
        postId="post-1"
        reactions={[]}
        currentMemberId={MARIA.id}
        onToggle={onToggle}
      />,
    )

    await user.click(screen.getByRole('button', { name: /❤️/ }))

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith('❤️')
  })

  it('renders avatar names of reactors as accessible labels (avatar stack)', () => {
    const reactions = [
      reaction('r1', '❤️', MARIA),
      reaction('r2', '❤️', GIORGIO),
    ]

    render(
      <ReactionBar
        postId="post-1"
        reactions={reactions}
        currentMemberId={MARIA.id}
        onToggle={() => undefined}
      />,
    )

    const heart = screen.getByRole('button', { name: /❤️/ })
    // Reactor names should be present (visible or via accessible label)
    // so screen readers can announce who reacted.
    expect(heart.getAttribute('aria-label')).toMatch(/Maria/)
    expect(heart.getAttribute('aria-label')).toMatch(/Giorgio/)
  })
})
