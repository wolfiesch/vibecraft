/**
 * Achievement Toast - Celebratory notifications
 *
 * Special toast for achievements like git commits.
 * Larger, more prominent, with celebration styling.
 */

export interface CommitAchievementOptions {
  /** Commit number (e.g., 47) */
  commitNumber: number
  /** Commit message (optional, will be truncated if too long) */
  message?: string
  /** Project name (optional) */
  projectName?: string
  /** Duration in milliseconds (default: 4000) */
  duration?: number
}

const DEFAULT_DURATION = 4000
const FADE_OUT_DURATION = 300
const MAX_MESSAGE_LENGTH = 50
const MAX_CONCURRENT_TOASTS = 3

let achievementContainer: HTMLElement | null = null
let activeToastCount = 0
const toastQueue: Array<() => void> = []

/**
 * Get or create the achievement toast container
 * Positioned differently from regular toasts - more prominent
 */
function getAchievementContainer(): HTMLElement {
  if (!achievementContainer) {
    achievementContainer = document.getElementById('achievement-container')
    if (!achievementContainer) {
      achievementContainer = document.createElement('div')
      achievementContainer.id = 'achievement-container'
      document.body.appendChild(achievementContainer)
    }
  }
  return achievementContainer
}

/**
 * Truncate message if too long
 */
function truncateMessage(message: string, maxLength: number = MAX_MESSAGE_LENGTH): string {
  if (message.length <= maxLength) return message
  return message.slice(0, maxLength - 3) + '...'
}

/**
 * Show a commit achievement toast
 * Queues the toast if MAX_CONCURRENT_TOASTS is reached
 */
export function showCommitAchievement(options: CommitAchievementOptions): HTMLElement | null {
  // If at max capacity, queue the toast
  if (activeToastCount >= MAX_CONCURRENT_TOASTS) {
    toastQueue.push(() => showCommitAchievementInternal(options))
    return null
  }
  return showCommitAchievementInternal(options)
}

/**
 * Internal function to actually show the toast
 */
function showCommitAchievementInternal(options: CommitAchievementOptions): HTMLElement {
  const {
    commitNumber,
    message,
    projectName,
    duration = DEFAULT_DURATION,
  } = options

  activeToastCount++

  const toast = document.createElement('div')
  toast.className = 'achievement-toast achievement-commit'

  // Build toast content
  let content = `
    <div class="achievement-icon">🎉</div>
    <div class="achievement-content">
      <div class="achievement-title">Commit #${commitNumber}</div>
  `

  if (message) {
    const truncatedMessage = truncateMessage(message)
    content += `<div class="achievement-message">${escapeHtml(truncatedMessage)}</div>`
  }

  if (projectName) {
    content += `<div class="achievement-project">${escapeHtml(projectName)}</div>`
  }

  content += `</div>`

  // Add confetti decorations
  content += `
    <div class="achievement-confetti">
      <span class="confetti-piece" style="--delay: 0s; --x: -20px;">🎊</span>
      <span class="confetti-piece" style="--delay: 0.1s; --x: 10px;">✨</span>
      <span class="confetti-piece" style="--delay: 0.2s; --x: 25px;">🎊</span>
    </div>
  `

  toast.innerHTML = content

  // Add to container
  const container = getAchievementContainer()
  container.appendChild(toast)

  // Trigger entrance animation
  requestAnimationFrame(() => {
    toast.classList.add('achievement-in')
  })

  // Auto-remove after duration
  setTimeout(() => {
    removeAchievement(toast)
  }, duration)

  return toast
}

/**
 * Remove an achievement toast with animation
 */
function removeAchievement(toast: HTMLElement): void {
  if (!toast.parentElement) return

  toast.classList.remove('achievement-in')
  toast.classList.add('achievement-out')

  setTimeout(() => {
    toast.remove()
    activeToastCount--

    // Process queued toast if any
    if (toastQueue.length > 0) {
      const nextToast = toastQueue.shift()
      nextToast?.()
    }
  }, FADE_OUT_DURATION)
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Export type for tracking commits
export interface CommitTracker {
  /** Increment and get the new commit count */
  increment(sessionId: string): number
  /** Get current count for a session */
  getCount(sessionId: string): number
  /** Reset count for a session */
  reset(sessionId: string): void
}

// localStorage persistence for commit counts
const COMMIT_COUNTS_STORAGE_KEY = 'vibecraft:commitCounts'
const commitCounts = new Map<string, number>()
let commitCountsInitialized = false

/**
 * Check if localStorage is available
 */
function isStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !('localStorage' in window)) {
      return false
    }
    const testKey = '__vibecraft_test__'
    window.localStorage.setItem(testKey, '1')
    window.localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

/**
 * Load commit counts from localStorage
 */
function loadCommitCountsFromStorage(): void {
  if (commitCountsInitialized || !isStorageAvailable()) {
    commitCountsInitialized = true
    return
  }
  commitCountsInitialized = true
  try {
    const raw = window.localStorage.getItem(COMMIT_COUNTS_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, number>
    if (parsed && typeof parsed === 'object') {
      for (const [sessionId, count] of Object.entries(parsed)) {
        if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
          commitCounts.set(sessionId, count)
        }
      }
    }
  } catch {
    // Ignore storage errors, use memory-only
  }
}

/**
 * Save commit counts to localStorage
 */
function saveCommitCountsToStorage(): void {
  if (!isStorageAvailable()) return
  try {
    const obj: Record<string, number> = {}
    for (const [sessionId, count] of commitCounts.entries()) {
      obj[sessionId] = count
    }
    window.localStorage.setItem(COMMIT_COUNTS_STORAGE_KEY, JSON.stringify(obj))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Ensure commit counts are initialized from storage
 */
function ensureCommitCountsInitialized(): void {
  if (!commitCountsInitialized) {
    loadCommitCountsFromStorage()
  }
}

export const commitTracker: CommitTracker = {
  increment(sessionId: string): number {
    ensureCommitCountsInitialized()
    const current = commitCounts.get(sessionId) || 0
    const newCount = current + 1
    commitCounts.set(sessionId, newCount)
    saveCommitCountsToStorage()
    return newCount
  },

  getCount(sessionId: string): number {
    ensureCommitCountsInitialized()
    return commitCounts.get(sessionId) || 0
  },

  reset(sessionId: string): void {
    ensureCommitCountsInitialized()
    commitCounts.delete(sessionId)
    saveCommitCountsToStorage()
  },
}
