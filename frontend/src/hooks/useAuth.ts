import { useNavigate } from 'react-router-dom'

import { authService } from '../services/auth.service'
import { useAuthStore } from '../store/authStore'
import { LoginRequest, RegisterRequest } from '../types/auth'

export function useAuth() {
  const { login, logout: clearStore, isAuthenticated, user } = useAuthStore()
  const navigate = useNavigate()

  async function register(data: RegisterRequest): Promise<void> {
    const response = await authService.register(data)
    login(response.access_token, response.refresh_token, response.user)
    navigate('/dashboard')
  }

  async function logIn(data: LoginRequest): Promise<void> {
    const response = await authService.login(data)
    login(response.access_token, response.refresh_token, response.user)
    navigate('/dashboard')
  }

  async function logOut(): Promise<void> {
    try {
      await authService.logout()
    } finally {
      clearStore()
      navigate('/')
    }
  }

  return { register, logIn, logOut, isAuthenticated, user }
}
