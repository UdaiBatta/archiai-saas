import { create } from 'zustand'
import api from '../services/api'

export interface Comment {
  id: string
  parent_id: string | null
  body: string
  room_id: string | null
  x: number
  y: number
  z: number
  resolved: boolean
  created_at: string
  author_id: string
  author_name: string
}

export interface Point {
  x: number
  y: number
  z: number
  roomId: string | null
}

interface CommentsState {
  projectId: string | null
  comments: Comment[]
  /** Pin mode: the next click on the model drops a new comment there. */
  placing: boolean
  /** Where the comment being written will go. */
  draft: Point | null
  openId: string | null
  showResolved: boolean
  error: string | null
  load: (projectId: string) => Promise<void>
  setPlacing: (on: boolean) => void
  setDraft: (point: Point | null) => void
  open: (id: string | null) => void
  setShowResolved: (on: boolean) => void
  post: (body: string, target: { parentId: string } | Point) => Promise<void>
  resolve: (id: string, resolved: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
}

const base = (projectId: string) => `/api/projects/${projectId}/comments`

export const useComments = create<CommentsState>((set, get) => {
  const run = async (task: (projectId: string) => Promise<void>) => {
    const { projectId } = get()
    if (!projectId) return
    try {
      await task(projectId)
      set({ error: null })
    } catch {
      set({ error: 'Could not reach the server. Try again.' })
    }
  }
  return {
    projectId: null,
    comments: [],
    placing: false,
    draft: null,
    openId: null,
    showResolved: false,
    error: null,
    load: async (projectId) => {
      if (get().projectId !== projectId) set({ projectId, comments: [], draft: null, openId: null, placing: false })
      await run(async (id) => {
        const { data } = await api.get<Comment[]>(base(id))
        set({ comments: data })
      })
    },
    setPlacing: (placing) => set({ placing, draft: placing ? get().draft : null }),
    setDraft: (draft) => set({ draft, placing: false, openId: null }),
    open: (openId) => set({ openId, draft: null }),
    setShowResolved: (showResolved) => set({ showResolved }),
    post: (body, target) =>
      run(async (id) => {
        const payload = 'parentId' in target
          ? { body, parent_id: target.parentId }
          : { body, room_id: target.roomId, x: target.x, y: target.y, z: target.z }
        const { data } = await api.post<Comment>(base(id), payload)
        set((s) => ({
          comments: [...s.comments, data],
          draft: null,
          openId: 'parentId' in target ? s.openId : data.id,
        }))
      }),
    resolve: (commentId, resolved) =>
      run(async (id) => {
        const { data } = await api.patch<Comment>(`${base(id)}/${commentId}`, { resolved })
        set((s) => ({
          comments: s.comments.map((c) => (c.id === commentId ? data : c)),
          openId: resolved && !s.showResolved ? null : s.openId,
        }))
      }),
    remove: (commentId) =>
      run(async (id) => {
        await api.delete(`${base(id)}/${commentId}`)
        set((s) => ({
          comments: s.comments.filter((c) => c.id !== commentId && c.parent_id !== commentId),
          openId: s.openId === commentId ? null : s.openId,
        }))
      }),
  }
})

/** Threads in the order they were started: [first comment, replies]. */
export function threadsOf(comments: Comment[]): { root: Comment; replies: Comment[] }[] {
  return comments
    .filter((c) => c.parent_id === null)
    .map((root) => ({ root, replies: comments.filter((c) => c.parent_id === root.id) }))
}
