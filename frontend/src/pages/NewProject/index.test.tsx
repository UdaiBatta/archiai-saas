import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import projectService from '../../services/project.service'
import { saveMvpVersion } from '../../services/mvp.service'
import NewProjectPage, { blankPlan } from './index'

vi.mock('../../services/project.service', () => ({ default: { create: vi.fn() } }))
vi.mock('../../services/mvp.service', () => ({ saveMvpVersion: vi.fn() }))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ logOut: vi.fn(), user: { name: 'Test' } }) }))

function Arrived() {
  const location = useLocation()
  return <p>at:{location.pathname}{location.search}</p>
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/new']}>
      <Routes>
        <Route path="/projects/new" element={<NewProjectPage />} />
        <Route path="/projects/:id" element={<Arrived />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(projectService.create).mockReset()
  vi.mocked(saveMvpVersion).mockReset()
})

describe('New project page', () => {
  it('starts a blank plan on the plot and opens the editor, no brief', async () => {
    vi.mocked(projectService.create).mockResolvedValue({ id: 'p9' } as never)
    vi.mocked(saveMvpVersion).mockResolvedValue({} as never)
    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Untitled project'), 'Villa')
    await user.clear(screen.getByLabelText('Plot width (m)'))
    await user.type(screen.getByLabelText('Plot width (m)'), '10')
    await user.click(screen.getByRole('radio', { name: 'north' }))
    await user.click(screen.getByRole('button', { name: 'Open the editor' }))

    expect(projectService.create).toHaveBeenCalledWith({ title: 'Villa' })
    expect(saveMvpVersion).toHaveBeenCalledWith('p9', blankPlan(10, 15, 'north'))
    expect(await screen.findByText('at:/projects/p9?view=2d')).toBeInTheDocument()
  })

  it('rejects a plot too small to build on', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('Plot depth (m)'))
    await user.type(screen.getByLabelText('Plot depth (m)'), '2')
    await user.click(screen.getByRole('button', { name: 'Open the editor' }))
    expect(screen.getByRole('alert')).toHaveTextContent('between 4 and 500')
    expect(projectService.create).not.toHaveBeenCalled()
  })
})
