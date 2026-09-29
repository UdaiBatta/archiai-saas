import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AccountMenu } from './AccountMenu'

function Probe() {
  const location = useLocation()
  return <div>at:{location.pathname + location.hash}</div>
}

function renderMenu(onSignOut = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/projects']}>
      <Routes>
        <Route path="/projects" element={<AccountMenu name="Ada Lovelace" email="ada@example.com" onSignOut={onSignOut} />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
  return onSignOut
}

describe('AccountMenu', () => {
  it("shows the signed-in user's initials, then name and email when opened", async () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Account menu' })
    expect(trigger).toHaveTextContent('AL')

    await userEvent.click(trigger)
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toHaveAttribute('title', 'ada@example.com')
    expect(screen.queryByText(/invoice/i)).not.toBeInTheDocument()
  })

  it('signs out', async () => {
    const onSignOut = renderMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('opens settings', async () => {
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Settings' }))
    expect(screen.getByText('at:/settings')).toBeInTheDocument()
  })

  it('works from the keyboard', async () => {
    renderMenu()
    screen.getByRole('button', { name: 'Account menu' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
