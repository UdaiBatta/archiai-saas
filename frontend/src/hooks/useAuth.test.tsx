import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authService } from '../services/auth.service'
import { useAuthStore } from '../store/authStore'
import { useAuth } from './useAuth'

const navigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}))

vi.mock('../services/auth.service', () => ({
  authService: {
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
  },
}))

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useAuthStore.setState({
      token: 'stale-access-token',
      refreshToken: 'stale-refresh-token',
      user: {
        id: 'user-1',
        name: 'Testing',
        email: 'testing@example.com',
        created_at: '2026-09-14T00:00:00Z',
      },
      isAuthenticated: true,
    })
  })

  it('clears the local session even when server logout fails', async () => {
    vi.mocked(authService.logout).mockRejectedValue(new Error('session unavailable'))
    const { result } = renderHook(() => useAuth())

    await expect(act(() => result.current.logOut())).rejects.toThrow('session unavailable')

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(navigate).toHaveBeenCalledWith('/')
  })
})
