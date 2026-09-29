import { render, screen, waitFor } from '@testing-library/react'
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
    const email = screen.getByLabelText('Email')
    expect(email).toHaveValue('ada@example.com')
    expect(email).toHaveAttribute('readonly')
    expect(email).toHaveAccessibleDescription('Contact support to change your email.')
    expect(await screen.findByText('Starter')).toBeInTheDocument()
    expect(screen.getByText('PNG export')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View plans' })).toHaveAttribute('href', '/pricing')
    expect(screen.getByRole('navigation', { name: 'Settings sections' })).toBeInTheDocument()
  })

  it('keeps Save disabled until the name changes', async () => {
    renderSettings()
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Name'), 'x')
    expect(save).toBeEnabled()
    await userEvent.type(screen.getByLabelText('Name'), '{Backspace}')
    expect(save).toBeDisabled()
  })

  it('saves the name through the API and updates the signed-in user', async () => {
    const updateMe = vi.spyOn(authService, 'updateMe').mockResolvedValue({ ...USER, name: 'Ada King' })
    renderSettings()
    const name = screen.getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, ' Ada King ')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(updateMe).toHaveBeenCalledWith({ name: 'Ada King' })
    await waitFor(() => expect(screen.getAllByRole('status').some((el) => el.textContent === 'Saved')).toBe(true))
    expect(useAuthStore.getState().user?.name).toBe('Ada King')
  })

  it('changes the password with the current one', async () => {
    const changePassword = vi.spyOn(authService, 'changePassword').mockResolvedValue()
    renderSettings()
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Current password'), 'password123')
    await userEvent.type(screen.getByLabelText('New password'), 'brandnew123')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(changePassword).toHaveBeenCalledWith({ current_password: 'password123', new_password: 'brandnew123' })
    expect(await screen.findByText('Password changed')).toBeInTheDocument()
  })

  it('shows and hides a password', async () => {
    renderSettings()
    const field = screen.getByLabelText('Current password')
    expect(field).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Show current password' }))
    expect(field).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: 'Hide current password' }))
    expect(field).toHaveAttribute('type', 'password')
  })

  it('stores preferences per user and applies reduce motion', async () => {
    renderSettings()
    const reduce = screen.getByRole('switch', { name: 'Reduce motion' })
    expect(reduce).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(reduce)
    expect(reduce).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('switch', { name: 'Snap to grid' }))

    expect(loadPreferences('u1')).toEqual({ snapToGrid: true, reduceMotion: true })
    expect(loadPreferences('someone-else')).toEqual({ snapToGrid: false, reduceMotion: false })
    expect(document.documentElement).toHaveClass('reduce-motion')
  })
})
