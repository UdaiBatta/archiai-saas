// Deterministic avatar color from a hash of the user's name/email, so the
// same person always gets the same color (no randomness, no extra data).
const AVATAR_COLORS = ['#5F6E88', '#5E7876', '#84705B', '#71657E', '#6E7F68']

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

/** "Ada Lovelace" -> "AL", "ada@x.io" -> "A", "" -> "?". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0]?.[0] ?? '?')
  return letters.toUpperCase()
}

interface AvatarProps {
  name: string
  size?: number
}

export function Avatar({ name, size = 8 }: AvatarProps) {
  const color = AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length]
  return (
    <span
      aria-hidden="true"
      className="flex flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: color, height: `${size * 0.25}rem`, width: `${size * 0.25}rem` }}
    >
      {initials(name)}
    </span>
  )
}
