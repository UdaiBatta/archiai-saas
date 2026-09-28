import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import projectService, { Project } from '../../services/project.service'
import { Canvas3D } from '../../components/canvas/Canvas3D'
import { ZoningView } from '../../components/canvas/ZoningView'
import { RoomGraphView } from '../../components/canvas/RoomGraphView'
import { RightPanel } from '../../components/canvas/RightPanel'
import { EditorTopBar } from '../../components/canvas/EditorTopBar'
import { EditorDock } from '../../components/canvas/EditorDock'
import { BottomStatusBar } from '../../components/canvas/BottomStatusBar'
import { ToolRail } from '../../components/canvas/ToolRail'
import { MeasurePanel } from '../../components/canvas/MeasurePanel'
import { SelectionGizmo } from '../../components/canvas/SelectionGizmo'
import { WorkspacePanel } from '../../components/canvas/WorkspacePanel'
import { CommandBar } from '../../components/canvas/CommandBar'
import { BriefReviewPanel } from '../../components/canvas/BriefReviewPanel'
import { DraftToast } from '../../components/canvas/DraftToast'
import {
  DesignDraftResponse,
  fetchDesignDraft,
  getLatestProjectDesign,
  LayoutOption,
  saveDesignLayout,
} from '../../services/design.service'
import { extractBrief, generateMvpLayout } from '../../services/mvp.service'
import { generateResponseToCanvas } from '../../services/mvpLayoutAdapter'
import {
  reviewWithOverrides,
  type GenerationOverrides,
} from '../../services/mvpGenerationPolicy'
import { useCanvasStore, type CanvasViewMode } from '../../store/canvasStore'
import { layoutThumbnailDataUrl } from '../../components/canvas/LayoutThumbnail'
import { VersionHistoryDrawer } from '../../components/canvas/VersionHistoryDrawer'
import { ActivityDrawer } from '../../components/canvas/ActivityDrawer'
import { useAutoSave } from '../../hooks/useAutoSave'
import { useMvpQualityValidation } from '../../hooks/useMvpQualityValidation'
import { getApiErrorMessage } from '../../services/apiError'
import { ShareProjectDialog } from '../../components/projects/ShareProjectDialog'
import type { CanvasLayout } from '../../store/canvasStore'
import type { ExtractResponse } from '../../types/contracts'

// The card preview is drawn from the plan data. A screenshot of the first
// <canvas> came out black whenever the 2D (SVG) view was the one on screen.
function captureCanvasThumbnail() {
  const { rooms, floors } = useCanvasStore.getState()
  return layoutThumbnailDataUrl(rooms, floors)
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
  // Brief step over an existing plan (Edit ▸ Edit brief). Without a plan the
  // brief step is simply what the page shows.
  const [editingBrief, setEditingBrief] = useState(false)
  const [reviewPrompt, setReviewPrompt] = useState('')
  const [generationNotice, setGenerationNotice] = useState<string | null>(null)
  const [layoutSaving, setLayoutSaving] = useState(false)
  const [layoutSaveError, setLayoutSaveError] = useState<string | null>(null)
  const [versionName, setVersionName] = useState('')
  const [changeSummary, setChangeSummary] = useState('')
  const [duplicating, setDuplicating] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const generateAbortRef = useRef<AbortController | null>(null)
  const [draftToRecover, setDraftToRecover] = useState<DesignDraftResponse | null>(null)
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
  // Persp/Axo picked in the lens dock: the 3D view opens with that camera.
  const [lensExitPreset, setLensExitPreset] = useState<'perspective' | 'axo'>('perspective')
  const loadLayout = useCanvasStore((s) => s.loadLayout)
  const clearLayout = useCanvasStore((s) => s.clearLayout)
  const serializeLayout = useCanvasStore((s) => s.serializeLayout)
  const setRecoveredDraftAvailable = useCanvasStore((s) => s.setRecoveredDraftAvailable)

  useAutoSave({ designId, enabled: Boolean(designId) })

  useEffect(
    () => () => {
      generateAbortRef.current?.abort()
    },
    [],
  )

  // Refreshes the project-card thumbnail right after Generate, not
  // just on manual Save Layout — Generate already persists a Design behind
  // the scenes, so a project can otherwise sit with no real preview
  // indefinitely if the user never clicks Save. Fire-and-forget: a
  // best-effort upload that never blocks or fails the generation flow.
  const refreshThumbnailAfterGenerate = () => {
    if (!id) return
    void (async () => {
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
    await requestBriefReview(sourcePrompt)
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
      setActiveOption(0)
      setReviewChanges(false)
      useCanvasStore.getState().setViewMode('floor_plan')
      setSearchParams((current) => { const next = new URLSearchParams(current); next.delete('stage'); next.set('view', '2d'); return next }, { replace: true })
      refreshThumbnailAfterGenerate()
      setDraftToRecover(null)
      setRecoveredDraftAvailable(false)
      setBriefReview(null)
      setReviewPrompt('')
      setPrompt('')
      setEditingBrief(false)
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

  const handlePromptChange = (value: string) => {
    setPrompt(value)
    setGenerationNotice(null)
    setBriefReview(null)
  }

  const cancelGeneration = () => {
    generateAbortRef.current?.abort()
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
          navigate('/projects')
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

  // Arriving from /projects/new: the brief was just written there, so read
  // it back for review at once (review, not generate: nothing is drawn
  // until the user confirms what was understood).
  useEffect(() => {
    const state = location.state as { initialPrompt?: string; review?: boolean } | null
    if (!state?.initialPrompt) return
    setPrompt(state.initialPrompt)
    navigate(location.pathname, { replace: true, state: null })
    if (state.review) void requestBriefReview(state.initialPrompt)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per arrival
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
      navigate('/projects')
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
            viewMode === '3d' || viewMode === 'floor_plan' ? (
              // The plan tab is the 3D Top view (Canvas3D maps floor_plan to Top).
              <Canvas3D className="h-full" readOnly={generating} modelStage={modelStage} initialPreset={lensExitPreset} />
            ) : (
              <>
                {/* Hidden WebGL canvas keeps the thumbnail/PNG/PDF capture
                    path alive while an SVG lens (zoning/graph) is on. */}
                <div className="pointer-events-none invisible absolute inset-0" aria-hidden="true">
                  <Canvas3D className="h-full" readOnly />
                </div>
                {viewMode === 'zoning' && <ZoningView className="h-full" />}
                {viewMode === 'graph' && <RoomGraphView className="h-full" />}
                <EditorDock
                  className="bottom-[7.25rem]"
                  preset={null}
                  readOnly={generating}
                  onPreset={(preset) => {
                    if (preset !== 'top') setLensExitPreset(preset)
                    useCanvasStore.getState().setViewMode(preset === 'top' ? 'floor_plan' : '3d')
                  }}
                />
              </>
            )}

            <EditorTopBar
              projectTitle={project.title}
              onBackToDashboard={() => navigate('/projects')}
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
              menubar={{
                projectId: project.id,
                roomCount,
                onNewProject: () => navigate('/projects/new'),
                onOpenProject: (projectId) => navigate(`/projects/${projectId}`),
                onAllProjects: () => navigate('/projects'),
                onDuplicate: handleDuplicate,
                onExportImage: handleExportImage,
                onExportPdf: handleExportPdf,
                onExportError: setExportError,
                onShare: () => setShareOpen(true),
                onProjectDetails: enterEditMode,
                onDelete: handleDelete,
                onHistory: () => setHistoryOpen(true),
                onActivity: () => setActivityOpen(true),
                onEditBrief: () => {
                  // Start from the brief this plan was made from.
                  const saved = useCanvasStore.getState().layoutMetadata.prompt
                  if (!prompt.trim() && typeof saved === 'string') setPrompt(saved)
                  setGenerateError(null)
                  setEditingBrief(true)
                },
                optionCount: modelStage ? 0 : alternatives.length,
                activeOption,
                onPickOption: (index) => handlePickOption(alternatives[index]),
                exportingImage,
                exportingPdf,
                duplicating,
                deleting,
              }}
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

            {roomCount > 0 && !editingBrief && <>
              <div className="absolute inset-x-3 top-16 z-30 flex flex-wrap items-center justify-between gap-2">
                {modelStage ? <div className="flex items-center gap-3"><button type="button" onClick={leaveModelStage} disabled={generating} className="rounded-lg border border-ink/15 bg-graphite-800/95 px-3 py-2 text-xs text-ink">← Back to layout</button><span className="text-xs font-semibold text-ink">3D model</span></div> : null}
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" aria-expanded={panelOpen} onClick={() => setPanelOpen(!panelOpen)} className="rounded-lg border border-ink/15 bg-graphite-800 px-3 py-2 text-xs text-ink lg:hidden">Rooms & details</button>
                </div>
              </div>
              {!generating && <ToolRail modelStage={modelStage} />}
              {!generating && (viewMode === 'floor_plan' || viewMode === '3d') && <MeasurePanel />}
              {!generating && (viewMode === 'floor_plan' || viewMode === '3d') && <SelectionGizmo />}
            </>}

            {activityCount > 0 && !selectedId && !generationNotice && !activityOpen && (
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

            {editingBrief && roomCount > 0 && (
              <div aria-hidden="true" className="absolute inset-0 z-10 bg-graphite-900/75 backdrop-blur-sm" />
            )}

            {(roomCount === 0 || editingBrief) && <CommandBar
              onBackToPlan={roomCount > 0 ? () => setEditingBrief(false) : undefined}
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
              onCancel={cancelGeneration}
              busyLabel={
                generationStage === 'extracting'
                  ? 'Understanding...'
                  : generationStage === 'generating'
                    ? 'Generating...'
                    : undefined
              }
              generateError={generateError}
              onSubmit={handleSubmit}
            />}

            {roomCount > 0 && <BottomStatusBar />}
          </div>
          {roomCount > 0 && (viewMode === 'zoning' || viewMode === 'graph' ? <RightPanel onCreateModel={enterModelStage} open={panelOpen} onClose={() => setPanelOpen(false)} /> : <WorkspacePanel modelStage={modelStage} reviewChanges={reviewChanges} onReviewChanges={openReview} onCreateModel={enterModelStage} open={panelOpen} onClose={() => setPanelOpen(false)} busy={generating} />)}
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
