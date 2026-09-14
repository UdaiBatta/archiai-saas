import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import projectService, { Project } from '../../services/project.service'
import { Canvas3D } from '../../components/canvas/Canvas3D'
import { Plan2D } from '../../components/canvas/Plan2D'
import { ZoningView } from '../../components/canvas/ZoningView'
import { RoomGraphView } from '../../components/canvas/RoomGraphView'
import { RightPanel } from '../../components/canvas/RightPanel'
import { EditorTopBar } from '../../components/canvas/EditorTopBar'
import { ViewModeSwitcher } from '../../components/canvas/ViewModeSwitcher'
import { BottomStatusBar } from '../../components/canvas/BottomStatusBar'
import { ToolRail } from '../../components/canvas/ToolRail'
import { MeasurePanel } from '../../components/canvas/MeasurePanel'
import { SelectionGizmo } from '../../components/canvas/SelectionGizmo'
import { WorkspacePanel } from '../../components/canvas/WorkspacePanel'
import { CommandBar } from '../../components/canvas/CommandBar'
import { BriefReviewPanel } from '../../components/canvas/BriefReviewPanel'
import { DraftToast } from '../../components/canvas/DraftToast'
import { RefinementPlaybackPanel } from '../../components/canvas/RefinementPlaybackPanel'
import {
  DesignDraftResponse,
  fetchDesignDraft,
  generateLayout,
  getLatestProjectDesign,
  LayoutOption,
  refineLayout,
  saveDesignLayout,
  type RefinementChange,
  type RefineResponse,
} from '../../services/design.service'
import { buildRefinementPlaybackFrames } from '../../services/refinementPlayback'
import { extractBrief, generateMvpLayout } from '../../services/mvp.service'
import { generateResponseToCanvas } from '../../services/mvpLayoutAdapter'
import {
  generationEngineFor,
  reviewWithOverrides,
  type GenerationOverrides,
} from '../../services/mvpGenerationPolicy'
import { useCanvasStore, type CanvasViewMode } from '../../store/canvasStore'
import { VersionHistoryDrawer } from '../../components/canvas/VersionHistoryDrawer'
import { ActivityDrawer } from '../../components/canvas/ActivityDrawer'
import { useAutoSave } from '../../hooks/useAutoSave'
import { useMvpQualityValidation } from '../../hooks/useMvpQualityValidation'
import { getApiErrorMessage } from '../../services/apiError'
import { ShareProjectDialog } from '../../components/projects/ShareProjectDialog'
import type { CanvasLayout } from '../../store/canvasStore'
import type { ExtractResponse } from '../../types/contracts'

function captureCanvasThumbnail() {
  const canvas = document.querySelector('canvas')
  if (!canvas) return null
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

function exportFileName(projectTitle: string, extension: string) {
  const safeTitle = projectTitle
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'archiai-project'
  return `${safeTitle}-${new Date().toISOString().slice(0, 10)}.${extension}`
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
}

async function downloadProjectPdf(
  project: Project,
  layout: CanvasLayout,
  canvasImage: string,
  recordExport: () => Promise<unknown>,
) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 15
  const contentWidth = 180
  let y = 20

  pdf.setFontSize(18)
  pdf.text(project.title, margin, y)
  y += 9
  pdf.setFontSize(9)
  pdf.setTextColor(90)
  pdf.text(`Exported ${new Date().toLocaleString()}`, margin, y)
  y += 8

  if (project.description) {
    pdf.setFontSize(11)
    pdf.setTextColor(35)
    const description = pdf.splitTextToSize(project.description, contentWidth)
    pdf.text(description, margin, y)
    y += description.length * 5 + 5
  }

  const prompt = typeof layout.metadata?.prompt === 'string' ? layout.metadata.prompt : null
  if (prompt) {
    pdf.setFontSize(10)
    pdf.setTextColor(35)
    pdf.text('Design brief', margin, y)
    y += 5
    pdf.setFontSize(9)
    const promptLines = pdf.splitTextToSize(prompt, contentWidth)
    pdf.text(promptLines, margin, y)
    y += promptLines.length * 4.5 + 6
  }

  const imageProperties = pdf.getImageProperties(canvasImage)
  const imageHeight = Math.min(112, contentWidth * (imageProperties.height / imageProperties.width))
  pdf.addImage(canvasImage, 'PNG', margin, y, contentWidth, imageHeight)
  y += imageHeight + 8

  if (y > 250) {
    pdf.addPage()
    y = 20
  }

  const metadata = layout.metadata ?? {}
  const details = [
    typeof metadata.buildingType === 'string' ? `Building type: ${metadata.buildingType}` : null,
    typeof metadata.totalFloors === 'number' ? `Floors: ${metadata.totalFloors}` : null,
    typeof metadata.totalRooms === 'number' ? `Rooms: ${metadata.totalRooms}` : `Rooms: ${layout.rooms.length}`,
    typeof metadata.totalAreaSqm === 'number' ? `Area: ${metadata.totalAreaSqm} sqm` : null,
    layout.insights ? `Layout quality score: ${layout.insights.score}/100` : null,
  ].filter((value): value is string => Boolean(value))

  pdf.setFontSize(10)
  pdf.setTextColor(35)
  pdf.text('Layout summary', margin, y)
  y += 5
  pdf.setFontSize(9)
  details.forEach((detail) => {
    pdf.text(detail, margin, y)
    y += 4.5
  })

  await recordExport()
  pdf.save(exportFileName(project.title, 'pdf'))
}

function layoutSnapshotKey(layout: Pick<DesignDraftResponse, 'version' | 'metadata' | 'building' | 'floors' | 'rooms'>) {
  return JSON.stringify({
    version: layout.version,
    metadata: layout.metadata,
    building: layout.building,
    floors: layout.floors,
    rooms: layout.rooms,
  })
}

function hasRecoverableDraft(
  savedLayout: Pick<DesignDraftResponse, 'version' | 'metadata' | 'building' | 'floors' | 'rooms'>,
  draftLayout: Pick<DesignDraftResponse, 'version' | 'metadata' | 'building' | 'floors' | 'rooms'>,
) {
  return layoutSnapshotKey(savedLayout) !== layoutSnapshotKey(draftLayout)
}

function waitForRefinementMoment(durationMs: number, skip: boolean) {
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return new Promise<void>((resolve) =>
    window.setTimeout(resolve, skip || reduceMotion ? 0 : durationMs),
  )
}

// URL <-> store mapping for the editor view switcher, so 2D/3D/Zoning/Graph
// are deep-linkable (?view=2d|3d|zoning|graph) and survive reload/back.
const VIEW_PARAM_TO_MODE: Record<string, CanvasViewMode> = {
  '2d': 'floor_plan',
  '3d': '3d',
  zoning: 'zoning',
  graph: 'graph',
}
const VIEW_MODE_TO_PARAM: Record<CanvasViewMode, string> = {
  floor_plan: '2d',
  '3d': '3d',
  zoning: 'zoning',
  graph: 'graph',
}

function clarificationFromError(
  error: unknown,
): Pick<ExtractResponse, 'route' | 'questions' | 'optional_missing'> | null {
  const payload = (
    error as {
      response?: {
        data?: {
          error?: {
            route?: unknown
            questions?: unknown
            optional_missing?: unknown
          }
        }
      }
    }
  ).response?.data?.error
  if (
    payload &&
    (payload.route === 'vague' || payload.route === 'conflict') &&
    Array.isArray(payload.questions)
  ) {
    return {
      route: payload.route,
      questions: payload.questions.filter(
        (question): question is string => typeof question === 'string',
      ),
      optional_missing: Array.isArray(payload.optional_missing)
        ? payload.optional_missing.filter(
            (question): question is string => typeof question === 'string',
          )
        : [],
    }
  }
  return null
}

export default function ProjectPage() {
  useMvpQualityValidation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [prompt, setPrompt] = useState('')
  const [showParams, setShowParams] = useState(false)
  const [plotWidthM, setPlotWidthM] = useState('')
  const [floorsOverride, setFloorsOverride] = useState('')
  const [orientation, setOrientation] = useState<'' | 'N' | 'S' | 'E' | 'W'>('')
  const [alternatives, setAlternatives] = useState<LayoutOption[]>([])
  const [activeOption, setActiveOption] = useState(0)
  const [reviewChanges, setReviewChanges] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const modelStage = searchParams.get('stage') === 'model'
  const [generating, setGenerating] = useState(false)
  const [generationStage, setGenerationStage] = useState<
    'idle' | 'extracting' | 'generating'
  >('idle')
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [briefReview, setBriefReview] = useState<ExtractResponse | null>(null)
  const [reviewPrompt, setReviewPrompt] = useState('')
  const [generationNotice, setGenerationNotice] = useState<string | null>(null)
  const [layoutSaving, setLayoutSaving] = useState(false)
  const [layoutSaveError, setLayoutSaveError] = useState<string | null>(null)
  const [versionName, setVersionName] = useState('')
  const [changeSummary, setChangeSummary] = useState('')
  const [duplicating, setDuplicating] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [mode, setMode] = useState<'generate' | 'refine'>('generate')
  const [refinementSummary, setRefinementSummary] = useState<string | null>(null)
  const [refinementPlayback, setRefinementPlayback] = useState<{
    changes: RefinementChange[]
    activeIndex: number
    completedCount: number
  } | null>(null)
  const refinementRunRef = useRef(0)
  const generateAbortRef = useRef<AbortController | null>(null)
  const playbackSkipRef = useRef(false)
  const [draftToRecover, setDraftToRecover] = useState<DesignDraftResponse | null>(null)
  const userPickedModeRef = useRef(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [exportingImage, setExportingImage] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const designId = useCanvasStore((s) => s.designId)
  const roomCount = useCanvasStore((s) => s.rooms.length)
  const selectedId = useCanvasStore((s) => s.selectedId)
  const activityCount = useCanvasStore((s) => s.activityLog.length)
  const viewMode = useCanvasStore((s) => s.viewMode)
  const loadLayout = useCanvasStore((s) => s.loadLayout)
  const clearLayout = useCanvasStore((s) => s.clearLayout)
  const serializeLayout = useCanvasStore((s) => s.serializeLayout)
  const setRecoveredDraftAvailable = useCanvasStore((s) => s.setRecoveredDraftAvailable)

  useAutoSave({ designId, enabled: Boolean(designId) })

  useEffect(
    () => () => {
      refinementRunRef.current += 1
      generateAbortRef.current?.abort()
    },
    [],
  )

  const playRefinement = async (
    currentLayout: CanvasLayout,
    result: RefineResponse,
    runId: number,
  ) => {
    const frames = buildRefinementPlaybackFrames(currentLayout, result)
    const preservedView = useCanvasStore.getState().viewMode
    if (frames.length === 0) {
      loadLayout(result)
      useCanvasStore.getState().setViewMode(preservedView)
      return
    }

    setRefinementPlayback({
      changes: result.refinementChanges ?? [],
      activeIndex: 0,
      completedCount: 0,
    })

    for (let index = 0; index < frames.length; index += 1) {
      if (runId !== refinementRunRef.current) return
      const frame = frames[index]
      setRefinementPlayback({
        changes: result.refinementChanges ?? [],
        activeIndex: index,
        completedCount: index,
      })

      const beforeState = useCanvasStore.getState()
      beforeState.setSelectedFloor(frame.change.floorLevel)
      if (beforeState.rooms.some((room) => room.id === frame.change.objectId)) {
        beforeState.selectRoom(frame.change.objectId)
      }
      await waitForRefinementMoment(420, playbackSkipRef.current)
      if (runId !== refinementRunRef.current) return

      loadLayout(frame.layout)
      const afterState = useCanvasStore.getState()
      afterState.setViewMode(preservedView)
      afterState.setSelectedFloor(frame.change.floorLevel)
      if (afterState.rooms.some((room) => room.id === frame.change.objectId)) {
        afterState.selectRoom(frame.change.objectId)
      }
      setRefinementPlayback({
        changes: result.refinementChanges ?? [],
        activeIndex: index,
        completedCount: index + 1,
      })
      await waitForRefinementMoment(260, playbackSkipRef.current)
    }

    if (runId !== refinementRunRef.current) return
    loadLayout(result)
    const finalState = useCanvasStore.getState()
    finalState.setViewMode(preservedView)
    const lastChange = frames[frames.length - 1]?.change
    if (lastChange) {
      finalState.setSelectedFloor(lastChange.floorLevel)
      if (finalState.rooms.some((room) => room.id === lastChange.objectId)) {
        finalState.selectRoom(lastChange.objectId)
      }
    }
  }

  // Refreshes the Dashboard-card thumbnail right after Generate/Refine, not
  // just on manual Save Layout — Generate already persists a Design behind
  // the scenes, so a project can otherwise sit with no real preview
  // indefinitely if the user never clicks Save. Fire-and-forget: waits one
  // paint for the new layout to actually render, then best-effort uploads
  // it without blocking or failing the generation flow.
  const refreshThumbnailAfterGenerate = () => {
    if (!id) return
    void (async () => {
      await waitForNextPaint()
      const thumbnailUrl = captureCanvasThumbnail()
      if (!thumbnailUrl) return
      try {
        await projectService.update(id, { thumbnail_url: thumbnailUrl })
        setProject((current) => (current ? { ...current, thumbnail_url: thumbnailUrl } : current))
      } catch (err) {
        console.warn('Failed to refresh project thumbnail', err)
      }
    })()
  }

  const currentGenerationOverrides = (): GenerationOverrides => ({
    plotWidthM,
    floors: floorsOverride,
    orientation,
  })

  const requestBriefReview = async (sourcePrompt: string) => {
    const controller = new AbortController()
    generateAbortRef.current = controller
    setGenerating(true)
    setGenerationStage('extracting')
    setGenerateError(null)
    setLayoutSaveError(null)
    try {
      const result = await extractBrief(sourcePrompt, controller.signal)
      if (controller.signal.aborted) return
      setBriefReview(reviewWithOverrides(result, currentGenerationOverrides()))
      setReviewPrompt(sourcePrompt)
    } catch (err) {
      // A user cancel is not an error — the brief review just never opens.
      if (!axios.isCancel(err)) {
        setGenerateError(
          getApiErrorMessage(
            err,
            'I could not understand that brief. Check the AI provider configuration, then try again.',
          ),
        )
      }
    } finally {
      if (generateAbortRef.current === controller) {
        generateAbortRef.current = null
        setGenerating(false)
        setGenerationStage('idle')
      }
    }
  }

  const handleSubmit = async () => {
    const sourcePrompt = prompt.trim()
    if (!sourcePrompt) return
    if (mode !== 'refine' || !designId) {
      await requestBriefReview(sourcePrompt)
      return
    }

    setGenerating(true)
    setGenerationStage('generating')
    setGenerateError(null)
    setLayoutSaveError(null)
    const currentLayout = serializeLayout()
    const refinementRun = ++refinementRunRef.current
    try {
      const result = await refineLayout(designId, sourcePrompt, currentLayout)
      if (refinementRun !== refinementRunRef.current) return
      await playRefinement(currentLayout, result, refinementRun)
      setDraftToRecover(null)
      setRecoveredDraftAvailable(false)
      setRefinementSummary(result.refinementSummary)
      setAlternatives([])
      setReviewChanges(true)
      setPrompt('')
      setGenerationNotice(null)
      refreshThumbnailAfterGenerate()
    } catch (err) {
      setGenerateError(
        getApiErrorMessage(err, 'Refinement failed. Try a more specific change.'),
      )
    } finally {
      playbackSkipRef.current = false
      if (refinementRun === refinementRunRef.current) {
        setRefinementPlayback(null)
      }
      setGenerating(false)
      setGenerationStage('idle')
    }
  }

  const handleGenerateReviewed = async (useDefaults: boolean, extraNotes?: string) => {
    if (!briefReview) return
    // Extra rooms/constraints re-run extraction so the reviewed requirements
    // genuinely pick them up, then the (updated) review is shown again.
    if (extraNotes?.trim()) {
      const merged =
        (reviewPrompt || prompt.trim()) + '\n\nAdditional requirements: ' + extraNotes.trim()
      setPrompt(merged)
      setBriefReview(null)
      await requestBriefReview(merged)
      return
    }
    const activeReview = briefReview
    const sourcePrompt = reviewPrompt || prompt.trim()
    const controller = new AbortController()
    generateAbortRef.current = controller
    setGenerating(true)
    setGenerationStage('generating')
    setGenerateError(null)
    setLayoutSaveError(null)
    try {
      if (generationEngineFor(activeReview.requirements) === 'mvp') {
        const result = await generateMvpLayout({
          requirements: activeReview.requirements,
          useDefaults,
          projectId: id,
          prompt: sourcePrompt,
        }, controller.signal)
        if (controller.signal.aborted) return
        const initialLayout = generateResponseToCanvas(result, sourcePrompt)
        loadLayout(initialLayout)
        setAlternatives([initialLayout as LayoutOption, ...((result.alternatives ?? []) as LayoutOption[])])
        setGenerationNotice(
          result.defaults_applied.length > 0
            ? `Assumed: ${result.defaults_applied.join(', ')}`
            : null,
        )
      } else {
        const designParams = {
          plotWidthM: plotWidthM.trim() ? Number(plotWidthM) : undefined,
          floors: floorsOverride.trim() ? Number(floorsOverride) : undefined,
          orientation: orientation || undefined,
        }
        const hasParams =
          designParams.plotWidthM !== undefined ||
          designParams.floors !== undefined ||
          designParams.orientation !== undefined
        const result = await generateLayout(
          sourcePrompt,
          id,
          hasParams ? designParams : undefined,
          controller.signal,
        )
        if (controller.signal.aborted) return
        loadLayout(result)
        setAlternatives([result, ...(result.alternatives ?? [])])
        setGenerationNotice(null)
      }
      setActiveOption(0)
      setReviewChanges(false)
      useCanvasStore.getState().setViewMode('floor_plan')
      setSearchParams((current) => { const next = new URLSearchParams(current); next.delete('stage'); next.set('view', '2d'); return next }, { replace: true })
      refreshThumbnailAfterGenerate()
      setDraftToRecover(null)
      setRecoveredDraftAvailable(false)
      setRefinementSummary(null)
      setBriefReview(null)
      setReviewPrompt('')
      setPrompt('')
    } catch (err) {
      if (axios.isCancel(err) || controller.signal.aborted) return
      const clarification = clarificationFromError(err)
      if (clarification) {
        setBriefReview({
          ...activeReview,
          ...clarification,
        })
      } else {
        setGenerateError(
          getApiErrorMessage(
            err,
            'Generation failed. Try a more detailed description.',
          ),
        )
      }
    } finally {
      if (generateAbortRef.current === controller) {
        generateAbortRef.current = null
        setGenerating(false)
        setGenerationStage('idle')
      }
    }
  }

  const handleClarifyBrief = async (answers: string[], extraNotes?: string) => {
    if (!briefReview) return
    const additions = briefReview.questions.map(
      (question, index) => `${question}\nAnswer: ${answers[index]}`,
    )
    if (extraNotes?.trim()) additions.push('Additional requirements: ' + extraNotes.trim())
    const clarifiedPrompt =
      `${reviewPrompt || prompt.trim()}\n\nAdditional details:\n${additions.join('\n')}`
    setPrompt(clarifiedPrompt)
    setBriefReview(null)
    await requestBriefReview(clarifiedPrompt)
  }

  const handleModeChange = (next: 'generate' | 'refine') => {
    userPickedModeRef.current = true
    setMode(next)
    setBriefReview(null)
    setGenerateError(null)
  }

  const handlePromptChange = (value: string) => {
    setPrompt(value)
    setRefinementSummary(null)
    setGenerationNotice(null)
    setBriefReview(null)
  }

  const cancelGeneration = () => {
    generateAbortRef.current?.abort()
  }

  const handleSkipPlayback = () => {
    playbackSkipRef.current = true
  }

  const handlePickOption = (option: LayoutOption) => {
    const { designId: currentDesignId, designVersionId: currentDesignVersionId, viewMode: currentView, hasUnsavedChanges } = useCanvasStore.getState()
    if (hasUnsavedChanges && !window.confirm('Switch options and replace your unsaved layout edits? Save first if you want to keep them.')) return
    loadLayout({
      ...option,
      designId: currentDesignId ?? undefined,
      designVersionId: currentDesignVersionId ?? undefined,
    })
    useCanvasStore.getState().markDirty()
    useCanvasStore.getState().setViewMode(currentView)
    setActiveOption(alternatives.indexOf(option))
  }

  const enterModelStage = () => {
    useCanvasStore.getState().resetInteraction()
    useCanvasStore.getState().setPlacementMode(null)
    useCanvasStore.getState().setViewMode('3d')
    setReviewChanges(false)
    setSearchParams((current) => { const next = new URLSearchParams(current); next.set('stage', 'model'); next.set('view', '3d'); return next }, { replace: true })
  }

  const leaveModelStage = () => {
    useCanvasStore.getState().setPlacementMode(null)
    useCanvasStore.getState().setViewMode('floor_plan')
    setSearchParams((current) => { const next = new URLSearchParams(current); next.delete('stage'); next.set('view', '2d'); return next }, { replace: true })
  }

  const openReview = (value: boolean) => {
    setReviewChanges(value)
    setPanelOpen(true)
  }

  const focusRefinement = () => {
    if (modelStage) leaveModelStage()
    handleModeChange('refine')
    setPanelOpen(false)
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Layout prompt"]')?.focus())
  }

  const handleSaveLayout = async () => {
    if (!designId) {
      setLayoutSaveError('Generate or load a design before saving layout.')
      useCanvasStore.setState({ saveStatus: 'error' })
      return
    }
    setLayoutSaving(true)
    setLayoutSaveError(null)
    useCanvasStore.setState({ saveStatus: 'saving' })
    const thumbnailUrl = captureCanvasThumbnail()
    try {
      const result = await saveDesignLayout(designId, serializeLayout(), {
        versionName: versionName.trim() || undefined,
        changeSummary: changeSummary.trim() || undefined,
        thumbnailUrl,
      })
      loadLayout(result)
      setDraftToRecover(null)
      setRecoveredDraftAvailable(false)
      setVersionName('')
      setChangeSummary('')
      if (thumbnailUrl) {
        setProject((current) =>
          current
            ? { ...current, thumbnail_url: thumbnailUrl, updated_at: new Date().toISOString() }
            : current
        )
      }
    } catch (err) {
      useCanvasStore.setState({ saveStatus: 'error' })
      setLayoutSaveError(getApiErrorMessage(err, 'Failed to save layout'))
    } finally {
      setLayoutSaving(false)
    }
  }

  useEffect(() => {
    if (!id) return
    const projectId = id
    let active = true

    async function loadProject() {
      try {
        const data = await projectService.get(projectId)
        if (!active) return
        setProject(data)
        try {
          const latestDesign = await getLatestProjectDesign(projectId)
          if (active) {
            loadLayout(latestDesign)
            setDraftToRecover(null)
            setRecoveredDraftAvailable(false)
          }
          if (latestDesign.designId) {
            try {
              const draft = await fetchDesignDraft(latestDesign.designId)
              if (active && draft && hasRecoverableDraft(latestDesign, draft)) {
                setDraftToRecover(draft)
                setRecoveredDraftAvailable(true)
              }
            } catch (draftErr) {
              console.warn('Failed to load auto-save draft', draftErr)
            }
          }
        } catch (designErr) {
          const apiErr = designErr as { response?: { status?: number } }
          if (apiErr.response?.status === 404) {
            if (active) {
              clearLayout()
            }
          } else {
            console.warn('Failed to load latest project design', designErr)
          }
        }
        if (active) setLoading(false)
      } catch (err) {
        const apiErr = err as { response?: { status?: number; data?: { error?: string } } }
        if (!active) return
        if (apiErr.response?.status === 404) {
          navigate('/dashboard')
        } else {
          setError(apiErr.response?.data?.error ?? 'Failed to load project')
          setLoading(false)
        }
      }
    }

    loadProject()

    return () => {
      active = false
    }
  }, [id, navigate, loadLayout])

  useEffect(() => {
    if (designId && mode === 'generate' && !userPickedModeRef.current) {
      setMode('refine')
    }
  }, [designId, mode])

  // Adopt ?view= from the URL (initial load, back/forward navigation).
  useEffect(() => {
    const mode = searchParams.get('stage') === 'model' ? '3d' : VIEW_PARAM_TO_MODE[searchParams.get('view') ?? '']
    if (mode && mode !== useCanvasStore.getState().viewMode) {
      useCanvasStore.getState().setViewMode(mode)
    }
  }, [searchParams])

  // Reflect the live view into the URL. Reads the store directly so the
  // adoption effect above (same commit) can't be overwritten by a stale
  // closure value.
  useEffect(() => {
    const liveMode = useCanvasStore.getState().viewMode
    const param = VIEW_MODE_TO_PARAM[liveMode]
    setSearchParams(
      (current) => {
        if (current.get('view') === param) return current
        const next = new URLSearchParams(current)
        next.set('view', param)
        return next
      },
      { replace: true },
    )
  }, [viewMode, setSearchParams])

  // Prefill the prompt when arriving from the Dashboard's hero composer,
  // which creates the project first and forwards the brief via navigation
  // state rather than auto-generating sight-unseen.
  useEffect(() => {
    const initialPrompt = (location.state as { initialPrompt?: string } | null)?.initialPrompt
    if (initialPrompt) {
      setPrompt(initialPrompt)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.state, navigate])

  const enterEditMode = () => {
    if (!project) return
    setEditTitle(project.title)
    setEditDescription(project.description ?? '')
    setSaveError(null)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setSaveError(null)
  }

  const handleSave = async () => {
    if (!id || !project) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await projectService.update(id, {
        title: editTitle,
        description: editDescription,
      })
      setProject(updated)
      setEditing(false)
    } catch (err) {
      const apiErr = err as { response?: { data?: { error?: string } } }
      setSaveError(apiErr.response?.data?.error ?? 'Failed to save project')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    if (!window.confirm('Delete this project?')) return
    setDeleting(true)
    try {
      await projectService.delete(id)
      navigate('/dashboard')
    } catch (err) {
      const apiErr = err as { response?: { data?: { error?: string } } }
      setDeleteError(apiErr.response?.data?.error ?? 'Failed to delete project')
      setDeleting(false)
    }
  }

  const handleDuplicate = async () => {
    if (!id) return
    setDuplicating(true)
    setDuplicateError(null)
    try {
      const duplicate = await projectService.duplicate(id)
      navigate(`/projects/${duplicate.id}`)
    } catch (err) {
      const apiErr = err as { response?: { data?: { error?: string } } }
      setDuplicateError(apiErr.response?.data?.error ?? 'Failed to duplicate project')
      setDuplicating(false)
    }
  }

  const handleExportImage = async () => {
    if (!id || !project) return
    setExportingImage(true)
    setExportError(null)
    try {
      const image = captureCanvasThumbnail()
      if (!image) {
        setExportError('The canvas is not ready for export yet.')
        return
      }
      await projectService.recordExport(id, 'image')
      downloadDataUrl(image, exportFileName(project.title, 'png'))
    } catch (err) {
      setExportError(getApiErrorMessage(err, 'Failed to export PNG'))
    } finally {
      setExportingImage(false)
    }
  }

  const handleExportPdf = async () => {
    if (!id || !project) return
    setExportingPdf(true)
    setExportError(null)
    try {
      const image = captureCanvasThumbnail()
      if (!image) {
        setExportError('The canvas is not ready for export yet.')
        return
      }
      await downloadProjectPdf(
        project,
        serializeLayout(),
        image,
        () => projectService.recordExport(id, 'pdf'),
      )
    } catch (err) {
      setExportError(getApiErrorMessage(err, 'Failed to export PDF'))
    } finally {
      setExportingPdf(false)
    }
  }

  const handleRecoverDraft = () => {
    if (!draftToRecover) return
    loadLayout(draftToRecover)
    useCanvasStore.getState().markDirty()
    useCanvasStore.setState({
      lastDraftSavedAt: draftToRecover.updatedAt ?? draftToRecover.createdAt,
      latestDraftVersionId: draftToRecover.id,
      recoveredDraftAvailable: false,
    })
    setDraftToRecover(null)
    setLayoutSaveError(null)
  }

  const handleDismissDraft = () => {
    setDraftToRecover(null)
    setRecoveredDraftAvailable(false)
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-light">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-danger">{error}</p>
      </div>
    )
  }

  if (!project) return null

  return (
    <div className="flex h-screen bg-surface">
      {/* Main — editor pages use the compact tool rail only (no dashboard sidebar) */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Canvas + Inspector row */}
        <div className="flex-1 flex overflow-hidden">
          <div className="relative h-full min-w-0 flex-1">
            {roomCount === 0 ? <><Canvas3D className="h-full" readOnly briefBackground /><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(25,27,32,0.75)_0%,rgba(25,27,32,0.1)_70%)]" /></> :
            viewMode === '3d' ? (
              <Canvas3D className="h-full" readOnly={generating} modelStage={modelStage} />
            ) : (
              <>
                {/* Hidden WebGL canvas keeps the thumbnail/PNG/PDF capture
                    path alive while an SVG lens (plan/zoning/graph) is on. */}
                <div className="pointer-events-none invisible absolute inset-0" aria-hidden="true">
                  <Canvas3D className="h-full" readOnly />
                </div>
                {viewMode === 'floor_plan' && (
                  <Plan2D
                    className="h-full pb-48 pt-28"
                    readOnly={generating}
                  />
                )}
                {viewMode === 'zoning' && <ZoningView className="h-full" />}
                {viewMode === 'graph' && <RoomGraphView className="h-full" />}
              </>
            )}

            <EditorTopBar
              projectTitle={project.title}
              onBackToDashboard={() => navigate('/dashboard')}
              editing={editing}
              editTitle={editTitle}
              setEditTitle={setEditTitle}
              editDescription={editDescription}
              setEditDescription={setEditDescription}
              saveError={saveError}
              savingTitle={saving}
              onEnterEdit={enterEditMode}
              onCancelEdit={cancelEdit}
              onSaveTitle={handleSave}
              onShare={() => setShareOpen(true)}
              avatarName={user?.name ?? user?.email ?? ''}
              designId={designId}
              hasLayout={roomCount > 0}
              layoutSaving={layoutSaving}
              layoutSaveError={layoutSaveError}
              versionName={versionName}
              setVersionName={setVersionName}
              changeSummary={changeSummary}
              setChangeSummary={setChangeSummary}
              onSaveLayout={handleSaveLayout}
              onHistory={() => setHistoryOpen(true)}
              onActivity={() => setActivityOpen(true)}
              onExportImage={handleExportImage}
              onExportPdf={handleExportPdf}
              onDuplicate={handleDuplicate}
              onEditProject={enterEditMode}
              onDelete={handleDelete}
              exportingImage={exportingImage}
              exportingPdf={exportingPdf}
              duplicating={duplicating}
              deleting={deleting}
              roomCount={roomCount}
              exportError={exportError}
              duplicateError={duplicateError}
              deleteError={deleteError}
            />

            <DraftToast
              visible={Boolean(draftToRecover)}
              onRecover={handleRecoverDraft}
              onDismiss={handleDismissDraft}
            />

            {briefReview && (
              <BriefReviewPanel
                key={`${reviewPrompt}:${briefReview.route}:${briefReview.questions.join('|')}`}
                review={briefReview}
                engine={generationEngineFor(briefReview.requirements)}
                busy={generating}
                error={generateError}
                onGenerate={handleGenerateReviewed}
                onClarify={handleClarifyBrief}
                onCancel={() => {
                  setBriefReview(null)
                  setGenerateError(null)
                }}
                onStop={cancelGeneration}
              />
            )}

            {roomCount > 0 && <>
              <div className="absolute inset-x-3 top-16 z-30 flex flex-wrap items-center justify-between gap-2">
                {modelStage ? <div className="flex items-center gap-3"><button type="button" onClick={leaveModelStage} disabled={generating} className="rounded-lg border border-ink/15 bg-graphite-800/95 px-3 py-2 text-xs text-ink">← Back to layout</button><span className="text-xs font-semibold text-ink">3D model</span></div> : <ViewModeSwitcher disabled={generating} />}
                <div className="flex items-center gap-2">
                  {!modelStage && alternatives.length > 0 && <select aria-label="Layout option" disabled={generating} value={activeOption} onChange={(event) => handlePickOption(alternatives[Number(event.target.value)])} className="max-w-36 rounded-lg border border-ink/10 bg-graphite-800 px-2 py-2 text-xs text-ink">{alternatives.map((_, index) => <option key={index} value={index}>Option {index + 1}{index === 0 ? ' · recommended' : ''}</option>)}</select>}
                  <button type="button" aria-expanded={panelOpen} onClick={() => setPanelOpen(!panelOpen)} className="rounded-lg border border-ink/15 bg-graphite-800 px-3 py-2 text-xs text-ink lg:hidden">Rooms & details</button>
                </div>
              </div>
              {!generating && <ToolRail modelStage={modelStage} />}
              {!generating && (viewMode === 'floor_plan' || viewMode === '3d') && <MeasurePanel />}
              {!generating && (viewMode === 'floor_plan' || viewMode === '3d') && <SelectionGizmo />}
            </>}

            {refinementPlayback && (
              <RefinementPlaybackPanel {...refinementPlayback} onSkip={handleSkipPlayback} />
            )}

            {refinementSummary && (
              <div
                role="status"
                aria-live="polite"
                className="absolute left-1/2 top-28 z-20 flex w-max max-w-[90%] -translate-x-1/2 items-center gap-3 rounded-xl border border-ok/30 bg-graphite-800/95 backdrop-blur px-4 py-2 shadow-sm"
              >
                <span className="text-xs font-medium text-ok">{refinementSummary}</span>
                <button
                  type="button"
                  aria-label="Dismiss"
                  className="text-xs font-medium text-ok hover:text-ink"
                  onClick={() => setRefinementSummary(null)}
                >
                  ✕
                </button>
              </div>
            )}

            {activityCount > 0 && !selectedId && !refinementSummary && !generationNotice && !activityOpen && (
              <button
                type="button"
                onClick={() => openReview(true)}
                className="absolute left-1/2 top-28 z-20 flex w-max max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-full border border-ink/15 bg-graphite-800/95 px-4 py-2 text-xs font-medium text-muted shadow-sm backdrop-blur hover:border-accent/60 hover:text-ink"
              >
                <span className="font-mono tabular-nums text-accent-bright">{activityCount}</span>
                {activityCount === 1 ? 'change made this session' : 'changes made this session'}
                <span className="font-semibold text-ink">— Review</span>
              </button>
            )}

            {generationNotice && (
              <div
                role="status"
                aria-live="polite"
                className="absolute left-1/2 top-28 z-20 flex w-max max-w-[90%] -translate-x-1/2 items-center gap-3 rounded-xl border border-warn/30 bg-graphite-800/95 px-4 py-2 shadow-sm backdrop-blur"
              >
                <span className="text-xs font-medium text-warn">{generationNotice}</span>
                <button
                  type="button"
                  aria-label="Dismiss assumptions"
                  className="text-xs font-medium text-warn hover:text-ink"
                  onClick={() => setGenerationNotice(null)}
                >
                  x
                </button>
              </div>
            )}

            {(!modelStage || roomCount === 0) && <CommandBar
              roomCount={roomCount}
              mode={mode}
              onModeChange={handleModeChange}
              designId={designId}
              showParams={showParams}
              setShowParams={setShowParams}
              plotWidthM={plotWidthM}
              setPlotWidthM={setPlotWidthM}
              floorsOverride={floorsOverride}
              setFloorsOverride={setFloorsOverride}
              orientation={orientation}
              setOrientation={setOrientation}
              prompt={prompt}
              setPrompt={handlePromptChange}
              generating={generating}
              generationStage={generationStage}
              onCancel={mode === 'refine' ? undefined : cancelGeneration}
              busyLabel={
                generationStage === 'extracting'
                  ? 'Understanding...'
                  : generationStage === 'generating'
                    ? mode === 'refine'
                      ? 'Refining...'
                      : 'Generating...'
                    : undefined
              }
              generateError={generateError}
              onSubmit={handleSubmit}
            />}

            {roomCount > 0 && <BottomStatusBar />}
          </div>
          {roomCount > 0 && (viewMode === 'zoning' || viewMode === 'graph' ? <RightPanel onCreateModel={enterModelStage} open={panelOpen} onClose={() => setPanelOpen(false)} /> : <WorkspacePanel modelStage={modelStage} reviewChanges={reviewChanges} onReviewChanges={openReview} onCreateModel={enterModelStage} onRefine={focusRefinement} open={panelOpen} onClose={() => setPanelOpen(false)} busy={generating} />)}
        </div>
      </main>

      <VersionHistoryDrawer
        projectId={id!}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />

      <ActivityDrawer
        projectId={id!}
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
      />

      <ShareProjectDialog
        projectId={id!}
        projectTitle={project.title}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </div>
  )
}
