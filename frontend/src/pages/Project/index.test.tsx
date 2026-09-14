import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ProjectPage from './index'
import api from '../../services/api'
import { useCanvasStore, INITIAL_ROOMS, DEFAULT_FLOOR, DEFAULT_FLOOR_HEIGHT } from '../../store/canvasStore'

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { name: 'Tester', email: 'tester@example.com' },
    logOut: vi.fn(),
  }),
}))

vi.mock('../../components/canvas/Canvas3D', () => ({ Canvas3D: () => null }))
vi.mock('../../components/canvas/Inspector', () => ({
  InspectorProperties: ({ room }: { room: { label: string } }) => (
    <div data-testid="inspector-properties">{room.label}</div>
  ),
}))

vi.mock('../../services/project.service', () => ({
  default: {
    get: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    versions: vi.fn().mockResolvedValue([]),
    activity: vi.fn().mockResolvedValue([]),
  },
}))

import projectService from '../../services/project.service'

const PROJECT_FIXTURE = {
  id: 'p1',
  user_id: 'u1',
  title: 'Test Project',
  description: null,
  thumbnail_url: null,
  created_at: '2026-05-28T00:00:00Z',
  updated_at: '2026-05-28T00:00:00Z',
}

const SAVED_DESIGN_FIXTURE = {
  version: '1.0',
  designId: 'd1',
  designVersionId: 'v1',
  metadata: { prompt: 'starter', building_type: 'apartment', room_count: 1 },
  building: { floorHeight: 3.2 },
  floors: [
    {
      id: 'floor_0',
      name: 'Ground Floor',
      level: 0,
      elevation: 0,
      rooms: [
        {
          ...INITIAL_ROOMS[0],
          floorId: 'floor_0',
          floorLevel: 0,
        },
      ],
    },
  ],
  rooms: [
    {
      ...INITIAL_ROOMS[0],
      floorId: 'floor_0',
      floorLevel: 0,
    },
  ],
}

const DRAFT_FIXTURE = {
  ...SAVED_DESIGN_FIXTURE,
  id: 'draft-v1',
  designVersionId: 'draft-v1',
  projectId: 'p1',
  versionNumber: 2,
  versionType: 'auto_draft',
  changeSummary: 'Auto-saved draft',
  createdAt: '2026-05-30T10:00:00.000Z',
  floors: [
    {
      id: 'floor_0',
      name: 'Ground Floor',
      level: 0,
      elevation: 0,
      rooms: [
        {
          ...INITIAL_ROOMS[0],
          label: 'Recovered Living Room',
          floorId: 'floor_0',
          floorLevel: 0,
          position: { ...INITIAL_ROOMS[0].position, x: 4 },
        },
      ],
    },
  ],
  rooms: [
    {
      ...INITIAL_ROOMS[0],
      label: 'Recovered Living Room',
      floorId: 'floor_0',
      floorLevel: 0,
      position: { ...INITIAL_ROOMS[0].position, x: 4 },
    },
  ],
}

function renderProjectPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1']}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  vi.mocked(api.post).mockReset()
  vi.mocked(api.put).mockReset()
  vi.mocked(projectService.get).mockReset()
  vi.mocked(projectService.versions).mockResolvedValue([])
  vi.mocked(projectService.activity).mockResolvedValue([])
  useCanvasStore.setState({
    rooms: INITIAL_ROOMS.map((r) => ({
      ...r,
      floorId: DEFAULT_FLOOR.id,
      floorLevel: DEFAULT_FLOOR.level,
      position: { ...r.position },
      size: { ...r.size },
      rotation: { ...r.rotation },
    })),
    floors: [DEFAULT_FLOOR],
    selectedFloor: 0,
    viewMode: '3d',
    floorHeight: DEFAULT_FLOOR_HEIGHT,
    designId: null,
    designVersionId: null,
    layoutMetadata: {},
    selectedId: null,
    snapToGrid: false,
    gridSize: 1,
    saveStatus: 'saved',
    lastSavedAt: null,
    hasUnsavedChanges: false,
    lastDraftSavedAt: null,
    draftStatus: 'idle',
    draftError: null,
    recoveredDraftAvailable: false,
    latestDraftVersionId: null,
    activityLog: [],
  })
  vi.mocked(projectService.get).mockResolvedValue(PROJECT_FIXTURE)
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/design/project/p1/latest') {
      const err: any = new Error('not found')
      err.response = { status: 404 }
      throw err
    }
    if (url.includes('/draft')) {
      const err: any = new Error('not found')
      err.response = { status: 404 }
      throw err
    }
    throw new Error('unexpected GET ' + url)
  })
})

describe('ProjectPage canvas views', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/api/design/project/p1/latest') return { data: SAVED_DESIGN_FIXTURE }
      throw Object.assign(new Error('not found'), { response: { status: 404 } })
    })
  })
  it('enters the model stage and returns without losing geometry or undo history', async () => {
    renderProjectPage()
    const user = userEvent.setup()
    await screen.findByRole('tab', { name: '2D Plan' })
    act(() => useCanvasStore.getState().updateRoom(INITIAL_ROOMS[0].id, { label: 'Revised living room' }))
    const before = useCanvasStore.getState().serializeLayout()
    const history = useCanvasStore.getState().past
    await user.click(screen.getByRole('button', { name: 'Create a 3D model →' }))
    expect(screen.getByText('Model & furniture')).toBeInTheDocument()
    expect(screen.queryByLabelText('Layout prompt')).not.toBeInTheDocument()
    expect(useCanvasStore.getState().serializeLayout()).toEqual(before)
    await user.click(screen.getByRole('button', { name: '+ Add furniture' }))
    expect(useCanvasStore.getState().placementMode).toBe('furniture')
    await user.click(screen.getByRole('button', { name: '← Back to layout' }))
    expect(useCanvasStore.getState().viewMode).toBe('floor_plan')
    expect(useCanvasStore.getState().placementMode).toBeNull()
    expect(useCanvasStore.getState().serializeLayout()).toEqual(before)
    expect(useCanvasStore.getState().past).toEqual(history)
    expect(useCanvasStore.getState().hasUnsavedChanges).toBe(true)
  })

  it('reviews actual session edits rather than only server activity', async () => {
    renderProjectPage()
    const user = userEvent.setup()
    await screen.findByRole('tab', { name: '2D Plan' })
    act(() => useCanvasStore.getState().updateRoom(INITIAL_ROOMS[0].id, { label: 'Lounge' }))
    await user.click(screen.getByRole('button', { name: /Review & refine/ }))
    expect(screen.getByRole('list', { name: 'Session changes' })).toHaveTextContent('Lounge')
    expect(projectService.activity).not.toHaveBeenCalled()
  })

  it('returns from model review to the editable refinement prompt', async () => {
    renderProjectPage()
    const user = userEvent.setup()
    await screen.findByRole('tab', { name: '2D Plan' })
    act(() => useCanvasStore.getState().updateRoom(INITIAL_ROOMS[0].id, { label: 'Lounge' }))
    await user.click(screen.getByRole('button', { name: 'Create a 3D model →' }))
    await user.click(screen.getByRole('button', { name: /change made this session/ }))
    await user.click(screen.getByRole('button', { name: 'Describe a refinement' }))
    expect(screen.getByLabelText('Layout prompt')).toBeInTheDocument()
    expect(useCanvasStore.getState().viewMode).toBe('floor_plan')
    expect(useCanvasStore.getState().rooms[0].label).toBe('Lounge')
  })

  it('submits current edits and preserves them when refinement fails', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('network down'))
    renderProjectPage()
    const user = userEvent.setup()
    await screen.findByRole('tab', { name: 'Refine' })
    act(() => useCanvasStore.getState().updateRoom(INITIAL_ROOMS[0].id, { position: { ...INITIAL_ROOMS[0].position, x: 2.25 } }))
    const current = useCanvasStore.getState().serializeLayout()
    await user.type(screen.getByLabelText('Layout prompt'), 'add a study')
    await user.click(screen.getByRole('button', { name: 'Refine' }))
    await screen.findByRole('alert')
    expect(api.post).toHaveBeenCalledWith('/api/design/refine', { designId: 'd1', prompt: 'add a study', currentLayout: current })
    expect(useCanvasStore.getState().serializeLayout()).toEqual(current)
    expect(useCanvasStore.getState().hasUnsavedChanges).toBe(true)
  })
  it('switches the 2D Plan tab to the shared-state SVG floor plan', async () => {
    renderProjectPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('tab', { name: '2D Plan' }))

    expect(screen.getByRole('application', { name: 'Editable floor plan' })).toBeInTheDocument()
    expect(useCanvasStore.getState().viewMode).toBe('floor_plan')
    expect(screen.getByRole('tab', { name: '3D Edit' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'More views' }))
    expect(screen.getByRole('tab', { name: 'Zoning' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Room Graph' })).toBeInTheDocument()
  })

  it('renders the zoning and room graph lenses from the same layout state', async () => {
    renderProjectPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'More views' }))
    await user.click(screen.getByRole('tab', { name: 'Zoning' }))
    expect(useCanvasStore.getState().viewMode).toBe('zoning')
    expect(screen.getByRole('application', { name: 'Zoning view' })).toBeInTheDocument()
    expect(screen.getByTestId('zone-legend')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Room Graph' }))
    expect(useCanvasStore.getState().viewMode).toBe('graph')
    expect(
      screen.getByRole('application', { name: 'Room relationship graph' }),
    ).toBeInTheDocument()
  })

  it('preserves the selected object when switching between editor views', async () => {
    renderProjectPage()
    const user = userEvent.setup()

    await screen.findByRole('tab', { name: '2D Plan' })
    const roomId = 'seed-room'
    useCanvasStore.setState({
      rooms: [
        {
          id: roomId,
          label: 'Seed Room',
          objectType: 'room',
          roomType: 'living_room',
          floorId: DEFAULT_FLOOR.id,
          floorLevel: DEFAULT_FLOOR.level,
          position: { x: 0, y: 1.5, z: 0 },
          size: { w: 4, h: 3, d: 4 },
          rotation: { x: 0, y: 0, z: 0 },
          color: '#5F6E88',
        },
      ],
    })
    useCanvasStore.getState().selectRoom(roomId)

    await user.click(screen.getByRole('button', { name: 'More views' }))
    await user.click(screen.getByRole('tab', { name: 'Zoning' }))
    expect(useCanvasStore.getState().selectedId).toBe(roomId)

    await user.click(screen.getByRole('tab', { name: '3D Edit' }))
    expect(useCanvasStore.getState().selectedId).toBe(roomId)
    expect(useCanvasStore.getState().rooms.length).toBeGreaterThan(0)
  })

  it('keeps program information in the sidebar instead of floating over the plan', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/api/design/project/p1/latest') return { data: SAVED_DESIGN_FIXTURE }
      if (url.includes('/draft')) {
        const err: any = new Error('not found')
        err.response = { status: 404 }
        throw err
      }
      throw new Error('unexpected GET ' + url)
    })
    useCanvasStore.setState({ viewMode: 'floor_plan', selectedId: null })
    renderProjectPage()

    expect(await screen.findByRole('complementary', { name: 'Workspace details' })).toBeInTheDocument()
    expect(screen.getByLabelText('Search rooms')).toBeInTheDocument()
    expect(screen.queryByText('Space program')).not.toBeInTheDocument()
    act(() => useCanvasStore.getState().selectRoom(INITIAL_ROOMS[0].id))

    expect(screen.getByTestId('inspector-properties')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /All rooms/ })).toBeInTheDocument()
  })
})

describe('ProjectPage refine flow', () => {
  const reviewFixture = {
    requirements: { building_type: 'school', floors: 1, rooms: [{ type: 'study', count: 4 }], adjacency: [], avoid_adjacency: [], plot: { width_m: 20, depth_m: 20 }, facing: 'east', missing_info: [] },
    route: 'generate', questions: [], optional_missing: [], understood_summary: ['4 studies'],
  }

  it('keeps extra room requirements with every clarification answer', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { ...reviewFixture, route: 'vague', questions: ['How many rooms?'] } }).mockResolvedValueOnce({ data: reviewFixture })
    renderProjectPage()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Layout prompt'), 'a small school')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await user.type(await screen.findByLabelText('Answer 1'), 'five')
    await user.type(screen.getByLabelText('Additional requirements'), 'and a library')
    await user.click(screen.getByRole('button', { name: 'Re-check brief' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.post).mock.calls[1]).toEqual(['/api/extract', { prompt: 'a small school\n\nAdditional details:\nHow many rooms?\nAnswer: five\nAdditional requirements: and a library' }, { signal: expect.any(AbortSignal) }])
  })

  it('cancels generation and ignores a late response without loading its rooms', async () => {
    let finish!: (value: unknown) => void
    vi.mocked(api.post).mockResolvedValueOnce({ data: reviewFixture }).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    renderProjectPage()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Layout prompt'), 'a school with four classrooms')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await user.click(await screen.findByRole('button', { name: 'Generate layout' }))
    const signal = vi.mocked(api.post).mock.calls[1][2]?.signal as AbortSignal
    await user.click(screen.getByRole('button', { name: 'Cancel generation' }))
    expect(signal.aborted).toBe(true)
    await act(async () => finish({ data: SAVED_DESIGN_FIXTURE }))
    expect(useCanvasStore.getState().rooms).toEqual([])
    expect(screen.getByRole('dialog', { name: 'Review design brief' })).toBeInTheDocument()
  })
  it('shows only the brief stage until a layout exists', async () => {
    renderProjectPage()

    await screen.findByLabelText('Layout prompt')
    expect(screen.queryByRole('tab', { name: 'Refine' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '2D Plan' })).not.toBeInTheDocument()
  })

  it('sends reviewed overrides to canonical multi-floor generation', async () => {
    const extracted = {
      requirements: {
        building_type: 'apartment',
        floors: 1,
        rooms: [{ type: 'bedroom', count: 1 }],
        adjacency: [],
        avoid_adjacency: [],
        plot: { width_m: null, depth_m: null },
        facing: null,
        missing_info: [],
      },
      route: 'generate',
      questions: [],
      optional_missing: [],
      understood_summary: ['Building: Apartment', '1 floor', '1 bedroom'],
    }
    const generated = {
      requirements: {
        ...extracted.requirements,
        floors: 2,
        plot: { width_m: 10, depth_m: null },
        facing: 'north',
      },
      layout: {
        plot: { width_m: 10, depth_m: 12, facing: 'north' },
        rooms: [],
        walls: [],
        doors: [],
      },
      quality: { valid: true, score: 100, hard_violations: [], warnings: [] },
      defaults_applied: [],
      designId: 'd1',
      designVersionId: 'v1',
    }
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === '/api/extract') return { data: extracted }
      if (url === '/api/generate') return { data: generated }
      throw new Error('unexpected POST ' + url)
    })

    renderProjectPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Plot settings' }))
    await user.type(screen.getByLabelText(/Plot width/), '10')
    await user.type(screen.getByLabelText(/Floors/), '2')
    await user.selectOptions(screen.getByLabelText('Entry faces'), 'N')
    await user.type(screen.getByLabelText('Layout prompt'), 'studio apartment')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByText('2 floors')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Generate layout' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/generate',
        {
          requirements: {
            ...extracted.requirements,
            floors: 2,
            plot: { width_m: 10, depth_m: null },
            facing: 'north',
          },
          useDefaults: false,
          prompt: 'studio apartment',
          projectId: 'p1',
        },
        { signal: expect.any(AbortSignal) },
      ),
    )
  })

  it('shows the option gallery after generating and lets the user pick an alternative', async () => {
    const extracted = {
      requirements: {
        building_type: 'school',
        floors: 1,
        rooms: [{ type: 'study', count: 1 }],
        adjacency: [],
        avoid_adjacency: [],
        plot: { width_m: 9, depth_m: 12 },
        facing: 'east',
        missing_info: [],
      },
      route: 'generate',
      questions: [],
      optional_missing: [],
      understood_summary: ['Building: School', '1 floor', '1 study'],
    }
    const winner = {
      version: '1.0',
      designId: 'd1',
      designVersionId: 'v1',
      metadata: { prompt: 'apartment', building_type: 'apartment', room_count: 1, placementEngine: 'tile' },
      building: { floorHeight: 3.2 },
      floors: SAVED_DESIGN_FIXTURE.floors,
      rooms: SAVED_DESIGN_FIXTURE.rooms,
      insights: { score: 90, reasons: [], warnings: [], appliedRules: [] },
      alternatives: [
        {
          version: '1.0',
          metadata: { prompt: 'apartment', building_type: 'apartment', room_count: 1, placementEngine: 'bsp' },
          building: { floorHeight: 3.2 },
          floors: [
            {
              id: 'floor_0',
              name: 'Ground',
              level: 0,
              elevation: 0,
              rooms: [
                {
                  id: 'alt-room-1',
                  label: 'Bedroom',
                  objectType: 'room',
                  position: { x: 0, y: 1.5, z: 0 },
                  size: { w: 4, h: 3, d: 4 },
                  rotation: { x: 0, y: 0, z: 0 },
                  color: '#f472b6',
                },
              ],
            },
          ],
          rooms: [
            {
              id: 'alt-room-1',
              label: 'Bedroom',
              objectType: 'room',
              position: { x: 0, y: 1.5, z: 0 },
              size: { w: 4, h: 3, d: 4 },
              rotation: { x: 0, y: 0, z: 0 },
              color: '#f472b6',
            },
          ],
          insights: { score: 84, reasons: [], warnings: [], appliedRules: [] },
        },
      ],
    }
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === '/api/extract') return { data: extracted }
      if (url === '/api/design/generate') return { data: winner }
      throw new Error('unexpected POST ' + url)
    })

    renderProjectPage()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Layout prompt'), 'apartment with bedroom')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await user.click(await screen.findByRole('button', { name: 'Generate layout' }))

    const options = await screen.findByRole('combobox', { name: 'Layout option' })
    expect(useCanvasStore.getState().viewMode).toBe('floor_plan')
    await user.selectOptions(options, '1')

    expect(useCanvasStore.getState().rooms.map((room) => room.label)).toEqual(['Bedroom'])
    expect(useCanvasStore.getState().saveStatus).toBe('unsaved')
    expect(useCanvasStore.getState().designId).toBe('d1')
  })

  it('reviews and loads a canonical single-floor MVP response', async () => {
    const requirements = {
      building_type: 'house',
      floors: 1,
      rooms: [{ type: 'bedroom', count: 1 }],
      adjacency: [],
      avoid_adjacency: [],
      plot: { width_m: null, depth_m: null },
      facing: null,
      missing_info: ['plot_size', 'facing', 'bathroom_count'],
    }
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === '/api/extract') {
        return {
          data: {
            requirements,
            route: 'generate',
            questions: [],
            optional_missing: ['What plot size should I use?'],
            understood_summary: ['Building: House', '1 floor', '1 bedroom'],
          },
        }
      }
      if (url === '/api/generate') {
        return {
          data: {
            requirements: {
              ...requirements,
              plot: { width_m: 9, depth_m: 12 },
              facing: 'east',
              rooms: [
                { type: 'bedroom', count: 1 },
                { type: 'bathroom', count: 1 },
              ],
            },
            layout: {
              plot: { width_m: 9, depth_m: 12, facing: 'east' },
              rooms: [
                {
                  id: 'mvp-room-1',
                  type: 'bedroom',
                  label: 'Bedroom',
                  x: 0,
                  y: 0,
                  w: 9,
                  h: 12,
                  rotation: 0,
                },
              ],
              walls: [],
              doors: [],
            },
            quality: { valid: true, score: 92, hard_violations: [], warnings: [] },
            defaults_applied: ['9x12 m plot', 'east facing', '1 bathroom'],
            designId: 'mvp-design-1',
            designVersionId: 'mvp-version-1',
          },
        }
      }
      throw new Error('unexpected POST ' + url)
    })

    renderProjectPage()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Layout prompt'), 'one bedroom house')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByText('Your brief, understood.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Generate with defaults' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/generate',
        {
          requirements,
          useDefaults: true,
          projectId: 'p1',
          prompt: 'one bedroom house',
        },
        { signal: expect.any(AbortSignal) },
      ),
    )
    expect(useCanvasStore.getState().rooms[0]).toMatchObject({
      id: 'mvp-room-1',
      label: 'Bedroom',
      objectType: 'room',
    })
    expect(useCanvasStore.getState().designId).toBe('mvp-design-1')
    expect(await screen.findByText(/Assumed: 9x12 m plot/)).toBeInTheDocument()
  })

  it('posts to /api/design/refine when Refine mode is active', async () => {
    const designFixture = {
      ...SAVED_DESIGN_FIXTURE,
      version: '1.0',
      designId: 'd1',
      designVersionId: 'v1',
      metadata: { prompt: 'starter', building_type: 'apartment', room_count: 1 },
      building: { floorHeight: 3.2 },
      floors: SAVED_DESIGN_FIXTURE.floors,
      rooms: SAVED_DESIGN_FIXTURE.rooms,
    }
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/api/design/project/p1/latest') return { data: designFixture }
      if (url === '/api/design/d1/draft') {
        const err: any = new Error('not found')
        err.response = { status: 404 }
        throw err
      }
      throw new Error('unexpected URL ' + url)
    })
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === '/api/design/refine') {
        return {
          data: {
            ...designFixture,
            refinementSummary: 'Added 1 bedroom',
          },
        }
      }
      throw new Error('unexpected POST ' + url)
    })

    renderProjectPage()
    const user = userEvent.setup()

    const refineTab = await screen.findByRole('tab', { name: 'Refine' })
    await waitFor(() => expect(refineTab).not.toBeDisabled())
    await user.click(refineTab)

    const textarea = screen.getByLabelText('Layout prompt')
    await user.type(textarea, 'add a bedroom')
    const submitButton = screen.getByRole('button', { name: 'Refine' })
    await user.click(submitButton)

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/design/refine', {
        designId: 'd1',
        prompt: 'add a bedroom',
        currentLayout: expect.objectContaining({ rooms: expect.any(Array) }),
      }),
    )
  })

  it('renders and dismisses the refinement summary banner', async () => {
    const designFixture = {
      version: '1.0',
      designId: 'd1',
      designVersionId: 'v1',
      metadata: { prompt: 'starter', building_type: 'apartment', room_count: 1 },
      building: { floorHeight: 3.2 },
      floors: SAVED_DESIGN_FIXTURE.floors,
      rooms: SAVED_DESIGN_FIXTURE.rooms,
    }
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/api/design/project/p1/latest') return { data: designFixture }
      if (url === '/api/design/d1/draft') {
        const err: any = new Error('not found')
        err.response = { status: 404 }
        throw err
      }
      throw new Error('unexpected URL ' + url)
    })
    vi.mocked(api.post).mockResolvedValue({
      data: {
        ...designFixture,
        refinementSummary: 'Added 1 bedroom',
      },
    })

    renderProjectPage()
    const user = userEvent.setup()

    const refineTab = await screen.findByRole('tab', { name: 'Refine' })
    await waitFor(() => expect(refineTab).not.toBeDisabled())
    await user.click(refineTab)
    await user.type(screen.getByLabelText('Layout prompt'), 'add a bedroom')
    await user.click(screen.getByRole('button', { name: 'Refine' }))

    const banner = await screen.findByRole('status')
    expect(banner).toHaveTextContent('Added 1 bedroom')

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('applies authoritative refinement changes visibly before settling on the saved result', async () => {
    const addedBedroom = {
      ...INITIAL_ROOMS[3],
      id: 'refined-bedroom',
      label: 'Bedroom 2',
      floorId: 'floor_0',
      floorLevel: 0,
    }
    const refinedRooms = [...SAVED_DESIGN_FIXTURE.rooms, addedBedroom]
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/api/design/project/p1/latest') return { data: SAVED_DESIGN_FIXTURE }
      if (url === '/api/design/d1/draft') {
        const err: any = new Error('not found')
        err.response = { status: 404 }
        throw err
      }
      throw new Error('unexpected URL ' + url)
    })
    vi.mocked(api.post).mockResolvedValue({
      data: {
        ...SAVED_DESIGN_FIXTURE,
        designVersionId: 'v2',
        metadata: {
          ...SAVED_DESIGN_FIXTURE.metadata,
          room_count: refinedRooms.length,
        },
        floors: [
          {
            ...SAVED_DESIGN_FIXTURE.floors[0],
            rooms: refinedRooms,
          },
        ],
        rooms: refinedRooms,
        refinementSummary: 'Added 1 bedroom',
        refinementChanges: [
          {
            action: 'add',
            objectId: addedBedroom.id,
            roomType: 'bedroom',
            label: addedBedroom.label,
            floorLevel: 0,
            description: 'Add Bedroom 2',
          },
        ],
      },
    })

    renderProjectPage()
    const user = userEvent.setup()
    const refineTab = await screen.findByRole('tab', { name: 'Refine' })
    await waitFor(() => expect(refineTab).not.toBeDisabled())
    await user.click(refineTab)
    await user.type(screen.getByLabelText('Layout prompt'), 'add a bedroom')
    await user.click(screen.getByRole('button', { name: 'Refine' }))

    expect(
      await screen.findByRole('status', { name: 'Refinement progress' }),
    ).toHaveTextContent('Add Bedroom 2')
    expect(useCanvasStore.getState().rooms.some((room) => room.id === addedBedroom.id)).toBe(false)

    await waitFor(
      () =>
        expect(
          useCanvasStore.getState().rooms.some((room) => room.id === addedBedroom.id),
        ).toBe(true),
      { timeout: 2500 },
    )
    await waitFor(
      () =>
        expect(
          screen.queryByRole('status', { name: 'Refinement progress' }),
        ).not.toBeInTheDocument(),
      { timeout: 2500 },
    )
    expect(useCanvasStore.getState().designVersionId).toBe('v2')
    expect(useCanvasStore.getState().selectedId).toBe(addedBedroom.id)
    expect(await screen.findByText('Added 1 bedroom')).toBeInTheDocument()
  })
})

describe('ProjectPage history drawer', () => {
  it('opens the version history drawer when the History button is clicked', async () => {
    renderProjectPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('button', { name: 'History' }))

    expect(screen.getByRole('dialog', { name: 'Version history' })).toBeInTheDocument()
  })

  it('closes the version history drawer when the close button is clicked', async () => {
    renderProjectPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('button', { name: 'History' }))

    const closeButton = screen.getByRole('button', { name: 'Close history' })
    await userEvent.click(closeButton)

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Version history' })).not.toBeInTheDocument()
    )
  })

  it('opens the activity drawer when the Activity button is clicked', async () => {
    renderProjectPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('button', { name: 'Activity' }))

    expect(screen.getByRole('dialog', { name: 'Project activity' })).toBeInTheDocument()
  })
})

describe('ProjectPage draft recovery banner', () => {
  it('appears when a recoverable draft exists', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/api/design/project/p1/latest') return { data: SAVED_DESIGN_FIXTURE }
      if (url === '/api/design/d1/draft') return { data: DRAFT_FIXTURE }
      throw new Error('unexpected URL ' + url)
    })

    renderProjectPage()

    expect(
      await screen.findByText('Unsaved draft found. You can recover your last auto-saved changes.'),
    ).toBeInTheDocument()
  })

  it('does not appear when no draft exists', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/api/design/project/p1/latest') return { data: SAVED_DESIGN_FIXTURE }
      if (url === '/api/design/d1/draft') {
        const err: any = new Error('not found')
        err.response = { status: 404 }
        throw err
      }
      throw new Error('unexpected URL ' + url)
    })

    renderProjectPage()

    await screen.findByText('Test Project')
    await waitFor(() =>
      expect(
        screen.queryByText('Unsaved draft found. You can recover your last auto-saved changes.'),
      ).not.toBeInTheDocument(),
    )
  })

  it('loads a recovered draft as unsaved canvas work without manually saving it', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/api/design/project/p1/latest') return { data: SAVED_DESIGN_FIXTURE }
      if (url === '/api/design/d1/draft') return { data: DRAFT_FIXTURE }
      throw new Error('unexpected URL ' + url)
    })

    renderProjectPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Recover draft' }))

    await waitFor(() => {
      const state = useCanvasStore.getState()
      expect(state.rooms[0].label).toBe('Recovered Living Room')
      expect(state.rooms[0].position.x).toBe(4)
      expect(state.hasUnsavedChanges).toBe(true)
      expect(state.draftStatus).toBe('dirty')
      expect(state.saveStatus).toBe('unsaved')
      expect(state.latestDraftVersionId).toBe('draft-v1')
    })
    expect(api.put).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Recover draft' })).not.toBeInTheDocument()
  })

  it('dismisses the recovery banner without loading the draft', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/api/design/project/p1/latest') return { data: SAVED_DESIGN_FIXTURE }
      if (url === '/api/design/d1/draft') return { data: DRAFT_FIXTURE }
      throw new Error('unexpected URL ' + url)
    })

    renderProjectPage()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('button', { name: 'Recover draft' })).not.toBeInTheDocument()
    expect(useCanvasStore.getState().rooms[0].label).toBe('Living Room')
    expect(useCanvasStore.getState().recoveredDraftAvailable).toBe(false)
  })

  it('handles a no-draft 404 silently without showing a fatal page error', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/api/design/project/p1/latest') return { data: SAVED_DESIGN_FIXTURE }
      if (url === '/api/design/d1/draft') {
        const err: any = new Error('not found')
        err.response = { status: 404 }
        throw err
      }
      throw new Error('unexpected URL ' + url)
    })

    renderProjectPage()

    expect(await screen.findByText('Test Project')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recover draft' })).not.toBeInTheDocument()
    expect(screen.queryByText('Failed to load project')).not.toBeInTheDocument()
  })
})
