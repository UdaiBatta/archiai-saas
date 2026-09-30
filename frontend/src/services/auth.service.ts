import { AuthResponse, LoginRequest, RefreshResponse, RegisterRequest, UserOut } from '../types/auth'
import api from './api'
import { useAuthStore } from '../store/authStore'

export const authService = {
  register: (data: RegisterRequest): Promise<AuthResponse> =>
    api.post<AuthResponse>('/api/auth/register', data).then((r) => r.data),

  login: (data: LoginRequest): Promise<AuthResponse> =>
    api.post<AuthResponse>('/api/auth/login', data).then((r) => r.data),

  refresh: (refreshToken: string): Promise<RefreshResponse> =>
    api
      .post<RefreshResponse>('/api/auth/refresh', { refresh_token: refreshToken }, { skipAuthRefresh: true })
      .then((r) => r.data),

  logout: (): Promise<void> => {
    const refreshToken = useAuthStore.getState().refreshToken
    return api
      .post('/api/auth/logout', { refresh_token: refreshToken }, { skipAuthRefresh: true })
      .then(() => undefined)
  },

  updateMe: (data: { name: string }): Promise<UserOut> =>
    api.patch<UserOut>('/api/auth/me', data).then((r) => r.data),

  // Other sessions are signed out; this one continues on the fresh pair returned.
  changePassword: (data: { current_password: string; new_password: string }): Promise<void> =>
    api.post<AuthResponse>('/api/auth/password', data).then((r) => {
      useAuthStore.getState().setSessionTokens(r.data.access_token, r.data.refresh_token)
    }),

  getMe: (): Promise<UserOut> => {
    return api.get<UserOut>('/api/auth/me').then((r) => r.data)
  },
}
