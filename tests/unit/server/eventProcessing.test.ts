/**
 * Unit tests for server event processing logic
 *
 * Tests the core event transformation and duration calculation
 * that happens when events flow through the server.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { PreToolUseEvent, PostToolUseEvent, ClaudeEvent } from '../../../shared/types'

// Re-implement the core processing logic for testing
// (In production, these would be extracted to a separate module)

interface PendingToolUse {
  event: PreToolUseEvent
  timestamp: number
}

class EventProcessor {
  private pendingToolUses = new Map<string, PendingToolUse>()
  private seenEventIds = new Set<string>()
  private events: ClaudeEvent[] = []
  private maxEvents: number

  constructor(maxEvents = 1000) {
    this.maxEvents = maxEvents
  }

  processEvent(event: ClaudeEvent): ClaudeEvent {
    // Track pre_tool_use for duration calculation
    if (event.type === 'pre_tool_use') {
      const preEvent = event as PreToolUseEvent
      this.pendingToolUses.set(preEvent.toolUseId, {
        event: preEvent,
        timestamp: preEvent.timestamp,
      })
    }

    // Calculate duration for post_tool_use
    if (event.type === 'post_tool_use') {
      const postEvent = event as PostToolUseEvent
      const pending = this.pendingToolUses.get(postEvent.toolUseId)
      if (pending) {
        postEvent.duration = postEvent.timestamp - pending.timestamp
        this.pendingToolUses.delete(postEvent.toolUseId)
      }
    }

    return event
  }

  addEvent(event: ClaudeEvent): boolean {
    // Skip duplicates
    if (this.seenEventIds.has(event.id)) {
      return false
    }
    this.seenEventIds.add(event.id)

    // Process the event
    const processed = this.processEvent(event)
    this.events.push(processed)

    // Trim old events if over limit
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents)
    }

    // Trim old IDs to prevent memory leak
    if (this.seenEventIds.size > this.maxEvents * 2) {
      const idsToKeep = [...this.seenEventIds].slice(-this.maxEvents)
      this.seenEventIds.clear()
      idsToKeep.forEach((id) => this.seenEventIds.add(id))
    }

    return true
  }

  getEvents(): ClaudeEvent[] {
    return this.events
  }

  getPendingCount(): number {
    return this.pendingToolUses.size
  }

  clear(): void {
    this.pendingToolUses.clear()
    this.seenEventIds.clear()
    this.events = []
  }
}

// Helper to create test events
function createPreToolUseEvent(overrides: Partial<PreToolUseEvent> = {}): PreToolUseEvent {
  return {
    id: `event-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    type: 'pre_tool_use',
    sessionId: 'session-123',
    cwd: '/test/path',
    tool: 'Read',
    toolInput: { file_path: '/test/file.ts' },
    toolUseId: `toolu_${Math.random().toString(36).slice(2)}`,
    ...overrides,
  }
}

function createPostToolUseEvent(overrides: Partial<PostToolUseEvent> = {}): PostToolUseEvent {
  return {
    id: `event-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    type: 'post_tool_use',
    sessionId: 'session-123',
    cwd: '/test/path',
    tool: 'Read',
    toolInput: { file_path: '/test/file.ts' },
    toolResponse: { content: 'file contents' },
    toolUseId: `toolu_${Math.random().toString(36).slice(2)}`,
    success: true,
    ...overrides,
  }
}

describe('EventProcessor', () => {
  let processor: EventProcessor

  beforeEach(() => {
    processor = new EventProcessor()
  })

  describe('processEvent()', () => {
    it('tracks pre_tool_use events for duration calculation', () => {
      const preEvent = createPreToolUseEvent({ toolUseId: 'toolu_123' })
      processor.processEvent(preEvent)
      expect(processor.getPendingCount()).toBe(1)
    })

    it('calculates duration for matching post_tool_use events', () => {
      const toolUseId = 'toolu_abc123'
      const startTime = 1000

      const preEvent = createPreToolUseEvent({
        toolUseId,
        timestamp: startTime,
      })
      processor.processEvent(preEvent)

      const postEvent = createPostToolUseEvent({
        toolUseId,
        timestamp: startTime + 150, // 150ms later
      })
      const processed = processor.processEvent(postEvent) as PostToolUseEvent

      expect(processed.duration).toBe(150)
      expect(processor.getPendingCount()).toBe(0)
    })

    it('does not add duration when no matching pre_tool_use exists', () => {
      const postEvent = createPostToolUseEvent({
        toolUseId: 'toolu_orphan',
      })
      const processed = processor.processEvent(postEvent) as PostToolUseEvent

      expect(processed.duration).toBeUndefined()
    })

    it('removes pending entry after calculating duration', () => {
      const toolUseId = 'toolu_xyz'

      const preEvent = createPreToolUseEvent({ toolUseId })
      processor.processEvent(preEvent)
      expect(processor.getPendingCount()).toBe(1)

      const postEvent = createPostToolUseEvent({ toolUseId })
      processor.processEvent(postEvent)
      expect(processor.getPendingCount()).toBe(0)
    })

    it('handles multiple concurrent tool uses', () => {
      const toolUseId1 = 'toolu_1'
      const toolUseId2 = 'toolu_2'
      const toolUseId3 = 'toolu_3'

      // Start three tools at different times
      processor.processEvent(createPreToolUseEvent({ toolUseId: toolUseId1, timestamp: 1000 }))
      processor.processEvent(createPreToolUseEvent({ toolUseId: toolUseId2, timestamp: 1050 }))
      processor.processEvent(createPreToolUseEvent({ toolUseId: toolUseId3, timestamp: 1100 }))
      expect(processor.getPendingCount()).toBe(3)

      // Complete them in different order
      const post2 = processor.processEvent(
        createPostToolUseEvent({ toolUseId: toolUseId2, timestamp: 1200 })
      ) as PostToolUseEvent
      expect(post2.duration).toBe(150) // 1200 - 1050

      const post1 = processor.processEvent(
        createPostToolUseEvent({ toolUseId: toolUseId1, timestamp: 1300 })
      ) as PostToolUseEvent
      expect(post1.duration).toBe(300) // 1300 - 1000

      const post3 = processor.processEvent(
        createPostToolUseEvent({ toolUseId: toolUseId3, timestamp: 1150 })
      ) as PostToolUseEvent
      expect(post3.duration).toBe(50) // 1150 - 1100

      expect(processor.getPendingCount()).toBe(0)
    })
  })

  describe('addEvent()', () => {
    it('adds new events to the list', () => {
      const event = createPreToolUseEvent()
      processor.addEvent(event)
      expect(processor.getEvents()).toHaveLength(1)
    })

    it('skips duplicate events by ID', () => {
      const event = createPreToolUseEvent({ id: 'duplicate-id' })
      processor.addEvent(event)
      processor.addEvent(event) // Same ID
      expect(processor.getEvents()).toHaveLength(1)
    })

    it('returns true for new events, false for duplicates', () => {
      const event = createPreToolUseEvent({ id: 'test-id' })
      expect(processor.addEvent(event)).toBe(true)
      expect(processor.addEvent(event)).toBe(false)
    })

    it('trims events when over max limit', () => {
      const smallProcessor = new EventProcessor(5)

      for (let i = 0; i < 10; i++) {
        smallProcessor.addEvent(createPreToolUseEvent({ id: `event-${i}` }))
      }

      expect(smallProcessor.getEvents()).toHaveLength(5)
      // Should keep the most recent events
      expect(smallProcessor.getEvents()[0].id).toBe('event-5')
      expect(smallProcessor.getEvents()[4].id).toBe('event-9')
    })
  })

  describe('integration', () => {
    it('processes a complete tool use cycle with duration', () => {
      const toolUseId = 'toolu_full_cycle'

      const preEvent = createPreToolUseEvent({
        id: 'pre-event-1',
        toolUseId,
        tool: 'Bash',
        timestamp: 1000,
        toolInput: { command: 'npm test' },
      })

      const postEvent = createPostToolUseEvent({
        id: 'post-event-1',
        toolUseId,
        tool: 'Bash',
        timestamp: 1500,
        success: true,
        toolResponse: { output: 'tests passed' },
      })

      processor.addEvent(preEvent)
      processor.addEvent(postEvent)

      const events = processor.getEvents()
      expect(events).toHaveLength(2)

      const processedPost = events[1] as PostToolUseEvent
      expect(processedPost.duration).toBe(500)
    })

    it('handles interleaved tool uses from different sessions', () => {
      // Session A starts a Read
      const preA = createPreToolUseEvent({
        id: 'pre-a',
        sessionId: 'session-a',
        tool: 'Read',
        toolUseId: 'toolu_a',
        timestamp: 1000,
      })

      // Session B starts a Bash
      const preB = createPreToolUseEvent({
        id: 'pre-b',
        sessionId: 'session-b',
        tool: 'Bash',
        toolUseId: 'toolu_b',
        timestamp: 1050,
      })

      // Session B finishes first
      const postB = createPostToolUseEvent({
        id: 'post-b',
        sessionId: 'session-b',
        tool: 'Bash',
        toolUseId: 'toolu_b',
        timestamp: 1100,
      })

      // Session A finishes later
      const postA = createPostToolUseEvent({
        id: 'post-a',
        sessionId: 'session-a',
        tool: 'Read',
        toolUseId: 'toolu_a',
        timestamp: 1200,
      })

      processor.addEvent(preA)
      processor.addEvent(preB)
      processor.addEvent(postB)
      processor.addEvent(postA)

      const events = processor.getEvents()
      const processedPostA = events.find((e) => e.id === 'post-a') as PostToolUseEvent
      const processedPostB = events.find((e) => e.id === 'post-b') as PostToolUseEvent

      expect(processedPostA.duration).toBe(200) // 1200 - 1000
      expect(processedPostB.duration).toBe(50) // 1100 - 1050
    })
  })
})
