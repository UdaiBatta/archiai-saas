// Per-user app preferences, kept in this browser's localStorage. Only
// preferences that something actually reads belong here.
export interface Preferences {
  /** Grid snapping when a project opens in the editor. */
  snapToGrid: boolean
  /** Turn off interface animations and transitions. */
  reduceMotion: boolean
}

export const DEFAULT_PREFERENCES: Preferences = { snapToGrid: false, reduceMotion: false }

const key = (userId: string) => `archiai:prefs:${userId}`

export function loadPreferences(userId: string | undefined): Preferences {
  if (!userId) return DEFAULT_PREFERENCES
  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(localStorage.getItem(key(userId)) ?? '{}') }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function savePreferences(userId: string, prefs: Preferences): void {
  try {
    localStorage.setItem(key(userId), JSON.stringify(prefs))
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
  }
  applyReduceMotion(prefs.reduceMotion)
}

/** index.css turns animations off under html.reduce-motion. */
export function applyReduceMotion(on: boolean): void {
  document.documentElement.classList.toggle('reduce-motion', on)
}
