/**
 * Commit Celebration Handlers
 *
 * Orchestrates commit celebrations:
 * - Confetti burst on successful git commit
 * - Achievement toast with commit message
 * - Commit count tracking per session
 */

import { eventBus } from '../EventBus'
import type { PostToolUseEvent, BashToolInput } from '../../../shared/types'
import { showCommitAchievement, commitTracker } from '../../ui/AchievementToast'
import { getConfettiSystem } from '../../effects'
import * as THREE from 'three'

// Store reference to confetti system and scene
let confettiEnabled = true
let sceneRef: THREE.Scene | null = null
let getZonePositionFn: ((sessionId: string) => THREE.Vector3 | null) | null = null
let getProjectNameFn: ((sessionId: string) => string | undefined) | null = null

/**
 * Check if a Bash command is a git commit
 */
function isGitCommit(command: string): boolean {
  return /\bgit\s+commit\b/.test(command)
}

/**
 * Extract commit message from bash command
 * Matches: git commit -m "message" or git commit -m 'message'
 * Handles escaped quotes within the message (e.g., "Fix \"bug\" here")
 */
function extractCommitMessage(command: string): string | null {
  // Match -m "message" with support for escaped quotes
  // Pattern: (?:[^"\\]|\\.)* matches any non-quote/non-backslash char, OR any escaped char
  const doubleQuoteMatch = command.match(/git\s+commit\s+.*-m\s+"((?:[^"\\]|\\.)*)"/)
  if (doubleQuoteMatch) {
    // Unescape the matched content
    return doubleQuoteMatch[1].replace(/\\(.)/g, '$1')
  }

  // Match -m 'message' with support for escaped quotes
  const singleQuoteMatch = command.match(/git\s+commit\s+.*-m\s+'((?:[^'\\]|\\.)*)'/)
  if (singleQuoteMatch) {
    return singleQuoteMatch[1].replace(/\\(.)/g, '$1')
  }

  // Match heredoc style: -m "$(cat <<'EOF'...
  // These are complex, just return null for now
  return null
}

/**
 * Configure commit handlers
 */
export function configureCommitHandlers(options: {
  scene: THREE.Scene
  getZonePosition: (sessionId: string) => THREE.Vector3 | null
  getProjectName?: (sessionId: string) => string | undefined
}): void {
  sceneRef = options.scene
  getZonePositionFn = options.getZonePosition
  getProjectNameFn = options.getProjectName ?? null
}

/**
 * Enable/disable confetti celebrations
 */
export function setConfettiEnabled(enabled: boolean): void {
  confettiEnabled = enabled
}

/**
 * Register commit celebration event handlers
 */
export function registerCommitHandlers(): void {
  // Listen for successful git commit completions
  eventBus.on('post_tool_use', (event: PostToolUseEvent, ctx) => {
    // Only handle successful Bash commands
    if (event.tool !== 'Bash' || !event.success) return

    const input = event.toolInput as unknown as BashToolInput
    if (!input.command || !isGitCommit(input.command)) return

    // Get session info
    const sessionId = ctx.session?.id
    if (!sessionId) return

    // Extract commit message
    const message = extractCommitMessage(input.command)

    // Increment commit count
    const commitNumber = commitTracker.increment(sessionId)

    // Get project name if available
    const projectName = getProjectNameFn?.(sessionId)

    // Show achievement toast
    showCommitAchievement({
      commitNumber,
      message: message || undefined,
      projectName,
      duration: 4000,
    })

    // Trigger confetti if enabled and we have position info
    if (confettiEnabled && sceneRef && getZonePositionFn) {
      const position = getZonePositionFn(sessionId)
      if (position) {
        const confetti = getConfettiSystem(sceneRef)
        // Burst from slightly above the zone center
        const burstPosition = position.clone()
        burstPosition.y += 1.5
        confetti.burst(burstPosition, {
          count: 100,
          duration: 3,
          burstForce: 10,
        })
      }
    }

    console.log(`[CommitHandlers] Commit #${commitNumber} celebrated for session ${sessionId.slice(0, 8)}`)
  })
}

/**
 * Update confetti system (call each frame)
 * Returns true if confetti is active
 */
export function updateConfetti(deltaTime: number): boolean {
  if (!sceneRef) return false

  const confetti = getConfettiSystem(sceneRef)
  confetti.update(deltaTime)
  return confetti.isActive()
}
