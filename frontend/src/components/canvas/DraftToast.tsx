interface DraftToastProps {
  visible: boolean
  onRecover: () => void
  onDismiss: () => void
}

export function DraftToast({ visible, onRecover, onDismiss }: DraftToastProps) {
  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute right-3 top-16 z-20 flex items-center gap-3 rounded-full border border-warn/30 bg-graphite-800/95 backdrop-blur px-4 py-2 shadow-sm"
    >
      <p className="text-xs font-medium text-warn">
        Unsaved draft found. You can recover your last auto-saved changes.
      </p>
      <button
        type="button"
        onClick={onRecover}
        className="rounded-full border border-warn/40 bg-graphite-800 px-3 py-1 text-xs font-medium text-warn hover:bg-warn/15"
      >
        Recover draft
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs font-medium text-warn hover:text-ink"
      >
        Dismiss
      </button>
    </div>
  )
}
