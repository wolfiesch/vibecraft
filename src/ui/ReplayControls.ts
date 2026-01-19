/**
 * ReplayControls - UI panel for replay playback controls
 *
 * Renders play/pause, speed, scrubber, and exit controls.
 * Syncs with ReplayController state.
 */

import { replayController, type ReplayState, type ReplaySpeed } from '../replay'

export interface ReplayControlsOptions {
  onExit: () => void
  onSeek?: (index: number) => void
}

export class ReplayControls {
  private panel: HTMLElement | null = null
  private playBtn: HTMLButtonElement | null = null
  private prevBtn: HTMLButtonElement | null = null
  private nextBtn: HTMLButtonElement | null = null
  private scrubber: HTMLInputElement | null = null
  private timeDisplay: HTMLElement | null = null
  private speedSelect: HTMLSelectElement | null = null
  private exitBtn: HTMLButtonElement | null = null
  private eventCounter: HTMLElement | null = null

  private options: ReplayControlsOptions
  private unsubscribeState: (() => void) | null = null

  constructor(options: ReplayControlsOptions) {
    this.options = options
    this.setupDOM()
    this.setupEventListeners()
    this.subscribeToState()
  }

  private setupDOM(): void {
    this.panel = document.getElementById('replay-panel')
    if (!this.panel) {
      console.warn('Replay panel not found in DOM')
      return
    }

    this.playBtn = this.panel.querySelector('#replay-play')
    this.prevBtn = this.panel.querySelector('#replay-prev')
    this.nextBtn = this.panel.querySelector('#replay-next')
    this.scrubber = this.panel.querySelector('#replay-scrubber')
    this.timeDisplay = this.panel.querySelector('#replay-time')
    this.speedSelect = this.panel.querySelector('#replay-speed')
    this.exitBtn = this.panel.querySelector('#replay-exit')
    this.eventCounter = this.panel.querySelector('#replay-event-counter')
  }

  private setupEventListeners(): void {
    // Play/pause button
    this.playBtn?.addEventListener('click', () => {
      replayController.togglePlayPause()
    })

    // Previous event
    this.prevBtn?.addEventListener('click', () => {
      replayController.stepBackward()
    })

    // Next event
    this.nextBtn?.addEventListener('click', () => {
      replayController.stepForward()
    })

    // Scrubber
    this.scrubber?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement
      const index = parseInt(target.value, 10)
      replayController.seekTo(index)
      this.options.onSeek?.(index)
    })

    // Speed select
    this.speedSelect?.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement
      const speed = parseFloat(target.value) as ReplaySpeed
      replayController.setSpeed(speed)
    })

    // Exit button
    this.exitBtn?.addEventListener('click', () => {
      this.options.onExit()
    })

    // Keyboard shortcuts while replay panel is visible
    document.addEventListener('keydown', this.handleKeydown)
  }

  private handleKeydown = (e: KeyboardEvent): void => {
    // Only handle if in replay mode and panel is visible
    if (!replayController.isReplaying()) return
    if (this.panel?.classList.contains('hidden')) return

    // Don't intercept if typing in an input
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

    switch (e.key) {
      case ' ': // Space - play/pause
        e.preventDefault()
        replayController.togglePlayPause()
        break

      case 'ArrowLeft': // Left arrow - step back
        e.preventDefault()
        replayController.stepBackward()
        break

      case 'ArrowRight': // Right arrow - step forward
        e.preventDefault()
        replayController.stepForward()
        break

      case 's': // S - cycle speed
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          replayController.cycleSpeed()
        }
        break

      case 'Escape': // Escape - exit replay
        e.preventDefault()
        this.options.onExit()
        break
    }
  }

  private subscribeToState(): void {
    this.unsubscribeState = replayController.onStateChange((state) => {
      this.updateUI(state)
    })
  }

  private updateUI(state: ReplayState): void {
    if (!this.panel) return

    // Show/hide panel based on mode
    if (state.mode === 'live') {
      this.panel.classList.add('hidden')
      return
    } else {
      this.panel.classList.remove('hidden')
    }

    // Update play/pause button
    if (this.playBtn) {
      this.playBtn.textContent = state.mode === 'playing' ? '⏸' : '▶'
      this.playBtn.title = state.mode === 'playing' ? 'Pause (Space)' : 'Play (Space)'
    }

    // Update scrubber
    if (this.scrubber) {
      this.scrubber.max = (state.events.length - 1).toString()
      this.scrubber.value = state.currentIndex.toString()
    }

    // Update time display
    if (this.timeDisplay) {
      this.timeDisplay.textContent = replayController.getTimeString()
    }

    // Update event counter
    if (this.eventCounter) {
      this.eventCounter.textContent = `${state.currentIndex + 1} / ${state.events.length}`
    }

    // Update speed select
    if (this.speedSelect) {
      this.speedSelect.value = state.speed.toString()
    }

    // Update button states at boundaries
    if (this.prevBtn) {
      this.prevBtn.disabled = state.currentIndex === 0
    }
    if (this.nextBtn) {
      this.nextBtn.disabled = state.currentIndex >= state.events.length - 1
    }
  }

  // Show the controls panel
  show(): void {
    this.panel?.classList.remove('hidden')
  }

  // Hide the controls panel
  hide(): void {
    this.panel?.classList.add('hidden')
  }

  // Clean up
  dispose(): void {
    this.unsubscribeState?.()
    document.removeEventListener('keydown', this.handleKeydown)
  }
}

// Factory function for easy instantiation
export function setupReplayControls(options: ReplayControlsOptions): ReplayControls {
  return new ReplayControls(options)
}
