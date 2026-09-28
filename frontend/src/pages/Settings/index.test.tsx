import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import api from '@/services/api'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/store/authStore'
import { loadPreferences } from '@/utils/preferences'
import SettingsPage from './index'

const USER = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', created_at: '2026-01-01T00:00:00Z' }

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <SettingsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.classList.remove('reduce-motion')
  useAuthStore.setState({ user: USER, isAuthenticated: true, token: 't', refreshToken: 'r' })
  vi.spyOn(api, 'get').mockResolvedValue({ data: { plan_code: 'free' } })
})

describe('Settings page', () => {
  it("shows the user's profile and current plan", async () => {
    renderSettings()
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Ada Lovelace')
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com')
    expect(await screen.findByText('free')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See plans and pricing' })).toHaveAttribute('href', '/pricing')
  })

  it('saves the name through the API and updates the signed-in user', async () => {
    const updateMe = vi.spyOn(authService, 'updateMe').mockResolvedValue({ ...USER, name: 'Ada King' })
    renderSettings()
    const name = screen.getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, ' Ada King ')
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }))

    expect(updateMe).toHaveBeenCalledWith({ name: 'Ada King' })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(useAuthStore.getState().user?.name).toBe('Ada King')
  })

  it('changes the password with the current one', async () => {
    const changePassword = vi.spyOn(authService, 'changePassword').mockResolvedValue()
    renderSettings()
    await userEvent.type(screen.getByLabelText('Current password'), 'password123')
    await userEvent.type(screen.getByLabelText('New password'), 'brandnew123')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(changePassword).toHaveBeenCalledWith({ current_password: 'password123', new_password: 'brandnew123' })
    expect(await screen.findByText('Password changed')).toBeInTheDocument()
  })

  it('stores preferences per user and applies reduce motion', async () => {
    renderSettings()
    await userEvent.click(screen.getByRole('checkbox', { name: /Reduce motion/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Snap to grid/ }))

    expect(loadPreferences('u1')).toEqual({ snapToGrid: true, reduceMotion: true })
    expect(loadPreferences('someone-else')).toEqual({ snapToGrid: false, reduceMotion: false })
    expect(document.documentElement).toHaveClass('reduce-motion')
  })
})
