import { useEffect } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { getCanvasShortcut } from './keyboardShortcuts'
import { useMassUi } from '../../site/massStore'

interface CanvasKeyboardShortcutOptions {
  disabled?: boolean
}

/**
 * Shared editor shortcut boundary for both the WebGL and SVG canvases.
 * The shortcut parser already ignores inputs, textareas, and editable fields.
 */
export function useCanvasKeyboardShortcuts({
  disabled = false,
}: CanvasKeyboardShortcutOptions = {}) {
  useEffect(() => {
    if (disabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut = getCanvasShortcut(event)
      if (!shortcut) return

      const store = useCanvasStore.getState()
      if (shortcut === 'copy') {
        event.preventDefault()
        store.copySelected()
      } else if (shortcut === 'paste') {
        event.preventDefault()
        store.pasteClipboard()
      } else if (shortcut === 'undo') {
        event.preventDefault()
        store.undo()
      } else if (shortcut === 'redo') {
        event.preventDefault()
        store.redo()
      } else if (shortcut === 'duplicate') {
        event.preventDefault()
        store.duplicateSelected()
      } else if (shortcut === 'delete') {
        const massId = useMassUi.getState().selectedMassId
        if (store.selectedId) {
          event.preventDefault()
          store.deleteRoom(store.selectedId)
        } else if (massId) {
          event.preventDefault()
          store.deleteMass(massId)
          useMassUi.getState().select(null)
        }
      } else if (shortcut === 'escape') {
        event.preventDefault()
        window.dispatchEvent(new Event('archiai:cancel-canvas-interaction'))
        store.setPlacementMode(null)
        store.setShowDimensions(false)
        store.clearMeasure()
        store.resetInteraction()
        store.deselectAll()
        useMassUi.getState().select(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [disabled])
}
