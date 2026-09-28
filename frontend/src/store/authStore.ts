import { create } from 'zustand'

import { UserOut } from '../types/auth'

interface AuthState {
  user: UserOut | null
  token: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  login: (token: string, refreshToken: string, user: UserOut) => void
  setSessionTokens: (token: string, refreshToken: string) => void
  setUser: (user: UserOut) => void
  logout: () => void
}

const ACCESS_TOKEN_STORAGE_KEY = 'token'
const REFRESH_TOKEN_STORAGE_KEY = 'refreshToken'
const USER_STORAGE_KEY = 'user'

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  login: (token, refreshToken, user) => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token)
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken)
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
    set({ token, refreshToken, user, isAuthenticated: true })
  },
  setSessionTokens: (token, refreshToken) => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token)
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken)
    set({ token, refreshToken, isAuthenticated: true })
  },
  setUser: (user) => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
    set({ user })
  },
  logout: () => {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
    localStorage.removeItem(USER_STORAGE_KEY)
    set({ token: null, refreshToken: null, user: null, isAuthenticated: false })
  },
}))

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return (payload.exp as number) * 1000 < Date.now()
  } catch {
    return true
  }
}

export function initAuthFromStorage(): void {
  const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
  const userStr = localStorage.getItem(USER_STORAGE_KEY)
  if (!token || !refreshToken || !userStr) {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
    localStorage.removeItem(USER_STORAGE_KEY)
    return
  }
  try {
    if (isTokenExpired(refreshToken)) {
      localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
      localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
      localStorage.removeItem(USER_STORAGE_KEY)
      return
    }
    const user = JSON.parse(userStr) as UserOut
    useAuthStore.setState({
      token,
      refreshToken,
      user,
      isAuthenticated: true,
    })
  } catch {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
    localStorage.removeItem(USER_STORAGE_KEY)
  }
}
