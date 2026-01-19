/**
 * ReplaySceneManager - Scene state capture and reconstruction
 *
 * Handles saving and restoring the 3D scene state when entering/exiting replay mode,
 * and reconstructing scene state at specific points during replay.
 */

import type { WorkshopScene, Zone } from '../scene/WorkshopScene'
import type { Claude } from '../entities/ClaudeMon'
import type { SubagentManager } from '../entities/SubagentManager'
import type { ClaudeEvent, PreToolUseEvent, PostToolUseEvent, StationType } from '../../shared/types'
import { getStationForTool } from '../../shared/types'
import type { TimelineManager } from '../ui/TimelineManager'
import type { FeedManager } from '../ui/FeedManager'

// Snapshot of a single character's state
interface CharacterSnapshot {
  station: StationType
  state: 'idle' | 'walking' | 'working' | 'thinking'
  position: { x: number; y: number; z: number }
}

// Snapshot of a single zone's state
interface ZoneSnapshot {
  id: string
  color: number
  position: { x: number; y: number; z: number }
  status: Zone['status']
  elevation: number
  character?: CharacterSnapshot
  subagentCount: number
}

// Complete scene snapshot for restore
export interface SceneSnapshot {
  timestamp: number
  zones: ZoneSnapshot[]
  focusedZoneId: string | null
}

// Session state needed for replay reconstruction
export interface SessionState {
  claude: Claude
  subagents: SubagentManager
  zone: Zone
  color: number
  stats: {
    toolsUsed: number
    filesTouched: Set<string>
    activeSubagents: number
  }
}

type SessionGetter = (sessionId: string) => SessionState | undefined
type SessionCreator = (sessionId: string, cwd: string) => SessionState

export class ReplaySceneManager {
  private snapshot: SceneSnapshot | null = null
  private scene: WorkshopScene
  private timelineManager: TimelineManager | null = null
  private feedManager: FeedManager | null = null
  private getSession: SessionGetter
  private createSession: SessionCreator

  constructor(
    scene: WorkshopScene,
    getSession: SessionGetter,
    createSession: SessionCreator
  ) {
    this.scene = scene
    this.getSession = getSession
    this.createSession = createSession
  }

  // Set UI managers (called after init in main.ts)
  setManagers(timeline: TimelineManager, feed: FeedManager): void {
    this.timelineManager = timeline
    this.feedManager = feed
  }

  // Capture current scene state for later restoration
  captureSnapshot(): SceneSnapshot {
    const zones: ZoneSnapshot[] = []

    for (const [id, zone] of this.scene.zones) {
      const session = this.getSession(id)
      const zoneSnapshot: ZoneSnapshot = {
        id,
        color: zone.color,
        position: {
          x: zone.position.x,
          y: zone.position.y,
          z: zone.position.z,
        },
        status: zone.status,
        elevation: zone.elevation,
        subagentCount: session?.subagents?.count ?? 0,
      }

      // Capture character state if session exists
      if (session?.claude) {
        zoneSnapshot.character = {
          station: session.claude.currentStation,
          state: session.claude.state,
          position: {
            x: session.claude.mesh.position.x,
            y: session.claude.mesh.position.y,
            z: session.claude.mesh.position.z,
          },
        }
      }

      zones.push(zoneSnapshot)
    }

    this.snapshot = {
      timestamp: Date.now(),
      zones,
      focusedZoneId: this.scene.focusedZoneId,
    }

    return this.snapshot
  }

  // Get the captured snapshot
  getSnapshot(): SceneSnapshot | null {
    return this.snapshot
  }

  // Clear all zones and reset for replay
  resetForReplay(): void {
    // Clear all zones from scene
    for (const [id] of this.scene.zones) {
      this.scene.removeZone(id)
    }

    // Clear timeline and feed
    this.timelineManager?.clear()
    this.feedManager?.clear()
  }

  // Restore scene from snapshot (return to live mode)
  restoreSnapshot(snapshot?: SceneSnapshot): void {
    const snap = snapshot ?? this.snapshot
    if (!snap) {
      console.warn('No snapshot to restore')
      return
    }

    // For now, we rely on the live WebSocket reconnection to restore state
    // The snapshot could be used to restore positions immediately if needed
    // but the session state is managed by main.ts through the onSessions handler

    // Focus the previously focused zone
    if (snap.focusedZoneId) {
      this.scene.focusZone(snap.focusedZoneId)
    }
  }

  /**
   * Reconstruct scene state at a specific event index
   * This processes events from 0 to targetIndex to build up state
   */
  reconstructStateAt(events: ClaudeEvent[], targetIndex: number): void {
    // Clear current state
    this.resetForReplay()

    // Track pending tool uses for matching pre/post events
    const pendingToolUses = new Map<string, PreToolUseEvent>()

    // Track which tool uses have completed (for timeline icons)
    const completedToolUses = new Set<string>()

    // First pass: identify completed tool uses
    for (let i = 0; i <= targetIndex; i++) {
      const event = events[i]
      if (event.type === 'post_tool_use') {
        completedToolUses.add((event as PostToolUseEvent).toolUseId)
        this.timelineManager?.markCompleted((event as PostToolUseEvent).toolUseId)
      }
    }

    // Second pass: process events to reconstruct state
    for (let i = 0; i <= targetIndex; i++) {
      const event = events[i]
      this.processEventForReconstruction(event, pendingToolUses, completedToolUses)
    }

    // Update final character states based on pending vs completed tools
    for (const [sessionId, session] of this.getActiveSessions()) {
      // Check if there's a pending tool for this session
      let hasPendingTool = false
      for (const [, pending] of pendingToolUses) {
        if (pending.sessionId === sessionId && !completedToolUses.has(pending.toolUseId)) {
          hasPendingTool = true
          break
        }
      }

      if (hasPendingTool) {
        session.claude.setState('working')
      } else {
        session.claude.setState('idle')
      }
    }
  }

  /**
   * Process a single event for state reconstruction
   */
  private processEventForReconstruction(
    event: ClaudeEvent,
    pendingToolUses: Map<string, PreToolUseEvent>,
    completedToolUses: Set<string>
  ): void {
    // Ensure session/zone exists
    const session = this.getOrCreateSessionForEvent(event)
    if (!session) return

    switch (event.type) {
      case 'pre_tool_use': {
        const e = event as PreToolUseEvent
        pendingToolUses.set(e.toolUseId, e)

        // Move character to station (teleport for instant positioning)
        const station = getStationForTool(e.tool)
        if (station !== 'center') {
          session.claude.teleportTo(station)
        }

        // Spawn subagent for Task tool
        if (e.tool === 'Task') {
          const input = e.toolInput as { description?: string }
          session.subagents.spawn(e.toolUseId, input.description ?? 'Task')
        }

        // Add to timeline/feed
        const eventColor = session.color
        this.timelineManager?.add(event, eventColor)
        this.feedManager?.add(event, eventColor)
        break
      }

      case 'post_tool_use': {
        const e = event as PostToolUseEvent
        pendingToolUses.delete(e.toolUseId)
        completedToolUses.add(e.toolUseId)

        // Remove subagent for Task tool
        if (e.tool === 'Task') {
          session.subagents.remove(e.toolUseId)
        }

        // Track stats
        session.stats.toolsUsed++
        const filePath = (e.toolInput as { file_path?: string }).file_path
        if (filePath) {
          session.stats.filesTouched.add(filePath)
        }

        // Add to timeline/feed
        const eventColor = session.color
        this.timelineManager?.add(event, eventColor)
        this.feedManager?.add(event, eventColor)
        break
      }

      case 'user_prompt_submit':
      case 'stop':
      case 'session_start':
      case 'notification': {
        // Add to timeline/feed
        const eventColor = session.color
        this.timelineManager?.add(event, eventColor)
        this.feedManager?.add(event, eventColor)

        // Return to center on stop
        if (event.type === 'stop') {
          session.claude.teleportTo('center')
        }
        break
      }
    }
  }

  /**
   * Get or create session state for an event
   */
  private getOrCreateSessionForEvent(event: ClaudeEvent): SessionState | undefined {
    let session = this.getSession(event.sessionId)
    if (!session) {
      session = this.createSession(event.sessionId, event.cwd)
    }
    return session
  }

  /**
   * Get all active sessions (helper for iteration)
   */
  private getActiveSessions(): [string, SessionState][] {
    const sessions: [string, SessionState][] = []
    for (const [id] of this.scene.zones) {
      const session = this.getSession(id)
      if (session) {
        sessions.push([id, session])
      }
    }
    return sessions
  }
}
