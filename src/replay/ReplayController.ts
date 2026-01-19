/**
 * ReplayController - Core playback state machine
 *
 * Handles replay mode state transitions, event scheduling, and timing.
 * Uses requestAnimationFrame for smooth playback.
 */

import type { ClaudeEvent } from '../../shared/types'

export type ReplayMode = 'live' | 'paused' | 'playing'

export interface ReplayState {
  mode: ReplayMode
  currentIndex: number
  currentTime: number
  speed: number
  events: ClaudeEvent[]
  sessionFilter: string | null
  startTime: number  // Timestamp of first event
  endTime: number    // Timestamp of last event
  duration: number   // Total duration in ms
}

export type ReplayStateHandler = (state: ReplayState) => void
export type ReplayEventHandler = (event: ClaudeEvent, index: number) => void

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const
export type ReplaySpeed = typeof SPEED_OPTIONS[number]

export class ReplayController {
  private state: ReplayState = {
    mode: 'live',
    currentIndex: 0,
    currentTime: 0,
    speed: 1,
    events: [],
    sessionFilter: null,
    startTime: 0,
    endTime: 0,
    duration: 0,
  }

  private stateHandlers = new Set<ReplayStateHandler>()
  private eventHandlers = new Set<ReplayEventHandler>()

  private animationFrameId: number | null = null
  private lastFrameTime: number | null = null

  // Get current state (readonly copy)
  getState(): Readonly<ReplayState> {
    return { ...this.state }
  }

  // Check if in replay mode
  isReplaying(): boolean {
    return this.state.mode !== 'live'
  }

  // Enter replay mode with events
  enterReplay(events: ClaudeEvent[]): void {
    if (events.length === 0) {
      console.warn('Cannot enter replay with no events')
      return
    }

    // Sort events by timestamp
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp)

    this.state = {
      mode: 'paused',
      currentIndex: 0,
      currentTime: sorted[0].timestamp,
      speed: 1,
      events: sorted,
      sessionFilter: null,
      startTime: sorted[0].timestamp,
      endTime: sorted[sorted.length - 1].timestamp,
      duration: sorted[sorted.length - 1].timestamp - sorted[0].timestamp,
    }

    this.notifyStateChange()
  }

  // Exit replay mode and return to live
  exitReplay(): void {
    this.stop()
    this.state = {
      mode: 'live',
      currentIndex: 0,
      currentTime: 0,
      speed: 1,
      events: [],
      sessionFilter: null,
      startTime: 0,
      endTime: 0,
      duration: 0,
    }
    this.notifyStateChange()
  }

  // Start/resume playback
  play(): void {
    if (this.state.mode === 'live' || this.state.events.length === 0) return

    this.state.mode = 'playing'
    this.lastFrameTime = performance.now()
    this.scheduleNextFrame()
    this.notifyStateChange()
  }

  // Pause playback
  pause(): void {
    if (this.state.mode !== 'playing') return

    this.state.mode = 'paused'
    this.stop()
    this.notifyStateChange()
  }

  // Toggle play/pause
  togglePlayPause(): void {
    if (this.state.mode === 'playing') {
      this.pause()
    } else if (this.state.mode === 'paused') {
      this.play()
    }
  }

  // Seek to specific event index
  seekTo(index: number): void {
    if (this.state.mode === 'live' || this.state.events.length === 0) return

    const clampedIndex = Math.max(0, Math.min(index, this.state.events.length - 1))
    this.state.currentIndex = clampedIndex
    this.state.currentTime = this.state.events[clampedIndex].timestamp

    this.notifyStateChange()
  }

  // Seek to specific time (finds nearest event)
  seekToTime(time: number): void {
    if (this.state.mode === 'live' || this.state.events.length === 0) return

    // Find event at or just before the target time
    let index = 0
    for (let i = 0; i < this.state.events.length; i++) {
      if (this.state.events[i].timestamp <= time) {
        index = i
      } else {
        break
      }
    }

    this.seekTo(index)
  }

  // Step to next event
  stepForward(): void {
    if (this.state.currentIndex < this.state.events.length - 1) {
      this.seekTo(this.state.currentIndex + 1)
    }
  }

  // Step to previous event
  stepBackward(): void {
    if (this.state.currentIndex > 0) {
      this.seekTo(this.state.currentIndex - 1)
    }
  }

  // Set playback speed
  setSpeed(speed: ReplaySpeed): void {
    if (!SPEED_OPTIONS.includes(speed)) return
    this.state.speed = speed
    this.notifyStateChange()
  }

  // Cycle through speed options
  cycleSpeed(): void {
    const currentIdx = SPEED_OPTIONS.indexOf(this.state.speed as ReplaySpeed)
    const nextIdx = (currentIdx + 1) % SPEED_OPTIONS.length
    this.setSpeed(SPEED_OPTIONS[nextIdx])
  }

  // Set session filter (null = all sessions)
  setSessionFilter(sessionId: string | null): void {
    this.state.sessionFilter = sessionId
    this.notifyStateChange()
  }

  // Get filtered events based on session filter
  getFilteredEvents(): ClaudeEvent[] {
    if (!this.state.sessionFilter) return this.state.events
    return this.state.events.filter(e => e.sessionId === this.state.sessionFilter)
  }

  // Subscribe to state changes
  onStateChange(handler: ReplayStateHandler): () => void {
    this.stateHandlers.add(handler)
    return () => this.stateHandlers.delete(handler)
  }

  // Subscribe to event emissions (when events should be processed)
  onEvent(handler: ReplayEventHandler): () => void {
    this.eventHandlers.add(handler)
    return () => this.eventHandlers.delete(handler)
  }

  // Get progress as 0-1
  getProgress(): number {
    if (this.state.duration === 0) return 0
    return (this.state.currentTime - this.state.startTime) / this.state.duration
  }

  // Get formatted time string (MM:SS)
  getTimeString(): string {
    const elapsed = this.state.currentTime - this.state.startTime
    const total = this.state.duration
    return `${this.formatTime(elapsed)} / ${this.formatTime(total)}`
  }

  // Format milliseconds as MM:SS
  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  // Stop animation loop
  private stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
    this.lastFrameTime = null
  }

  // Schedule next animation frame
  private scheduleNextFrame(): void {
    this.animationFrameId = requestAnimationFrame(this.tick.bind(this))
  }

  // Animation tick - advance time and emit events
  private tick(now: number): void {
    if (this.state.mode !== 'playing') return

    if (this.lastFrameTime === null) {
      this.lastFrameTime = now
    }

    // Calculate elapsed time with speed multiplier
    const delta = (now - this.lastFrameTime) * this.state.speed
    this.lastFrameTime = now

    // Advance current time
    this.state.currentTime += delta

    // Find and emit events that should have played
    while (
      this.state.currentIndex < this.state.events.length &&
      this.state.events[this.state.currentIndex].timestamp <= this.state.currentTime
    ) {
      const event = this.state.events[this.state.currentIndex]

      // Apply session filter
      if (!this.state.sessionFilter || event.sessionId === this.state.sessionFilter) {
        this.notifyEventHandlers(event, this.state.currentIndex)
      }

      this.state.currentIndex++
    }

    // Check if we've reached the end
    if (this.state.currentIndex >= this.state.events.length) {
      this.state.mode = 'paused'
      this.state.currentIndex = this.state.events.length - 1
      this.stop()
      this.notifyStateChange()
      return
    }

    // Notify state change for progress updates
    this.notifyStateChange()

    // Schedule next frame
    this.scheduleNextFrame()
  }

  private notifyStateChange(): void {
    const stateCopy = { ...this.state }
    for (const handler of this.stateHandlers) {
      try {
        handler(stateCopy)
      } catch (e) {
        console.error('ReplayController state handler error:', e)
      }
    }
  }

  private notifyEventHandlers(event: ClaudeEvent, index: number): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event, index)
      } catch (e) {
        console.error('ReplayController event handler error:', e)
      }
    }
  }
}

// Export singleton instance
export const replayController = new ReplayController()
