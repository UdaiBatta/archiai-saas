import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import { threadsOf, useComments, type Comment } from './commentsStore'

vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))

const comment = (id: string, parent_id: string | null = null, resolved = false): Comment => ({
  id, parent_id, body: id, room_id: null, x: 0, y: 0, z: 0, resolved,
  created_at: '2026-10-01T00:00:00Z', author_id: 'u1', author_name: 'Asha',
})

beforeEach(() => {
  vi.mocked(api.get).mockResolvedValue({ data: [comment('a'), comment('b', 'a'), comment('c')] })
  useComments.setState({ projectId: null, comments: [], draft: null, openId: null, placing: false })
})

describe('comments store', () => {
  it('groups replies under their thread', () => {
    const threads = threadsOf([comment('a'), comment('b', 'a'), comment('c')])
    expect(threads.map((t) => [t.root.id, t.replies.map((r) => r.id)])).toEqual([['a', ['b']], ['c', []]])
  })

  it('pins a new comment at the draft point and opens it', async () => {
    await useComments.getState().load('p1')
    vi.mocked(api.post).mockResolvedValue({ data: comment('d') })
    useComments.getState().setDraft({ x: 1, y: 0, z: 2, roomId: 'r1' })
    await useComments.getState().post('Wider here', useComments.getState().draft!)
    expect(api.post).toHaveBeenCalledWith('/api/projects/p1/comments', { body: 'Wider here', room_id: 'r1', x: 1, y: 0, z: 2 })
    expect(useComments.getState()).toMatchObject({ draft: null, openId: 'd' })
    expect(useComments.getState().comments.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('deleting a thread drops its replies too', async () => {
    await useComments.getState().load('p1')
    vi.mocked(api.delete).mockResolvedValue({})
    await useComments.getState().remove('a')
    expect(useComments.getState().comments.map((c) => c.id)).toEqual(['c'])
  })
})
