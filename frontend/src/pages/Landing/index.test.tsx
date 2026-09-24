import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '../../store/authStore'
import { EXAMPLE } from '../../constants/examplePlan'
import Landing from './index'

function Probe() {
  const location = useLocation()
  return <div>at:{location.pathname + location.hash}</div>
}

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Every route the app defines (App.tsx); a link anywhere else leads nowhere.
const REAL_ROUTES = ['/', '/pricing', '/login', '/register', '/projects']
const REAL_SECTIONS = ['how-it-works', 'example', 'features']

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: false })
})

describe('Landing page', () => {
  it('leads with what the product does and one main action', () => {
    renderLanding()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Write the brief. Get the plan.' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Start designing — free' })[0]).toHaveAttribute('href', '/register')
    // No editor chrome on marketing pages.
    expect(screen.queryByRole('tab', { name: '2D Plan' })).not.toBeInTheDocument()
  })

  it('has no link or button that leads nowhere', () => {
    const { container } = renderLanding()
    for (const link of screen.getAllByRole('link')) {
      const [path, hash] = (link.getAttribute('href') ?? '').split('#')
      expect(REAL_ROUTES, `${link.textContent} -> ${link.getAttribute('href')}`).toContain(path || '/')
      if (hash) {
        expect(REAL_SECTIONS).toContain(hash)
        expect(container.querySelector(`#${hash}`), `section #${hash}`).not.toBeNull()
      }
    }
    // The old placeholder demo flow is gone.
    expect(screen.queryByText(/pending integration|Watch Demo|Book a Demo/i)).not.toBeInTheDocument()
  })

  it('shows the real example: brief, what was understood, and the generated plan', () => {
    renderLanding()
    const example = document.getElementById('example')!
    expect(within(example).getByText(`“${EXAMPLE.brief}”`)).toBeInTheDocument()
    expect(within(example).getByText('2 bathrooms')).toBeInTheDocument()
    expect(within(example).getByText('Keep apart')).toBeInTheDocument()
    expect(within(example).getByText('kitchen ↔ bathroom')).toBeInTheDocument()
    expect(within(example).getByRole('img', { name: /Generated floor plan: .*Master Bedroom/ })).toBeInTheDocument()
  })

  it('sends a signed-in visitor to their dashboard instead of sign-up', () => {
    useAuthStore.setState({ isAuthenticated: true })
    renderLanding()
    expect(screen.getAllByRole('link', { name: 'Start designing — free' })[0]).toHaveAttribute('href', '/projects')
    expect(screen.getByRole('link', { name: 'Your projects' })).toHaveAttribute('href', '/projects')
  })

  it('starts Starter from the pricing preview and keeps unreleased plans disabled', async () => {
    renderLanding()
    const user = userEvent.setup()
    for (const button of screen.getAllByRole('button', { name: 'Coming soon' })) {
      expect(button).toBeDisabled()
    }
    await user.click(screen.getByRole('button', { name: 'Start free' }))
    expect(screen.getByText('at:/register')).toBeInTheDocument()
  })
})
