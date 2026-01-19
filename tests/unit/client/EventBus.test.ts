/**
 * Unit tests for src/events/EventBus.ts
 *
 * Tests the decoupled event handling system that routes events
 * to various handlers (sound, notifications, character movement, etc.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventBus, EventContext, SessionContext } from '../../../src/events/EventBus'
import type { PreToolUseEvent, PostToolUseEvent, StopEvent } from '../../../shared/types'

// Mock context for testing
function createMockContext(overrides: Partial<EventContext> = {}): EventContext {
  return {
    scene: null,
    feedManager: null,
    timelineManager: null,
    session: null,
    soundEnabled: true,
    ...overrides,
  }
}

// Mock session context
function createMockSessionContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    id: 'test-session-123',
    color: 0x00ff00,
    claude: null,
    subagents: null,
    zone: null,
    stats: {
      toolsUsed: 0,
      filesTouched: new Set(),
      activeSubagents: 0,
    },
    ...overrides,
  }
}

// Mock events
function createMockPreToolUseEvent(overrides: Partial<PreToolUseEvent> = {}): PreToolUseEvent {
  return {
    id: 'event-123',
    timestamp: Date.now(),
    type: 'pre_tool_use',
    sessionId: 'session-123',
    cwd: '/test/path',
    tool: 'Read',
    toolInput: { file_path: '/test/file.ts' },
    toolUseId: 'toolu_123',
    ...overrides,
  }
}

function createMockPostToolUseEvent(overrides: Partial<PostToolUseEvent> = {}): PostToolUseEvent {
  return {
    id: 'event-456',
    timestamp: Date.now(),
    type: 'post_tool_use',
    sessionId: 'session-123',
    cwd: '/test/path',
    tool: 'Read',
    toolInput: { file_path: '/test/file.ts' },
    toolResponse: { content: 'file contents' },
    toolUseId: 'toolu_123',
    success: true,
    ...overrides,
  }
}

function createMockStopEvent(overrides: Partial<StopEvent> = {}): StopEvent {
  return {
    id: 'event-789',
    timestamp: Date.now(),
    type: 'stop',
    sessionId: 'session-123',
    cwd: '/test/path',
    stopHookActive: true,
    ...overrides,
  }
}

describe('EventBus', () => {
  let eventBus: EventBus

  beforeEach(() => {
    eventBus = new EventBus()
  })

  describe('on()', () => {
    it('subscribes a handler to an event type', () => {
      const handler = vi.fn()
      eventBus.on('pre_tool_use', handler)
      expect(eventBus.getHandlerCount('pre_tool_use')).toBe(1)
    })

    it('allows multiple handlers for the same event type', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      eventBus.on('pre_tool_use', handler1)
      eventBus.on('pre_tool_use', handler2)
      expect(eventBus.getHandlerCount('pre_tool_use')).toBe(2)
    })

    it('returns an unsubscribe function', () => {
      const handler = vi.fn()
      const unsubscribe = eventBus.on('pre_tool_use', handler)
      expect(eventBus.getHandlerCount('pre_tool_use')).toBe(1)

      unsubscribe()
      expect(eventBus.getHandlerCount('pre_tool_use')).toBe(0)
    })

    it('handles different event types separately', () => {
      const preHandler = vi.fn()
      const postHandler = vi.fn()
      eventBus.on('pre_tool_use', preHandler)
      eventBus.on('post_tool_use', postHandler)

      expect(eventBus.getHandlerCount('pre_tool_use')).toBe(1)
      expect(eventBus.getHandlerCount('post_tool_use')).toBe(1)
      expect(eventBus.getHandlerCount()).toBe(2)
    })
  })

  describe('emit()', () => {
    it('calls all handlers for the event type', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      eventBus.on('pre_tool_use', handler1)
      eventBus.on('pre_tool_use', handler2)

      const event = createMockPreToolUseEvent()
      const context = createMockContext()
      eventBus.emit('pre_tool_use', event, context)

      expect(handler1).toHaveBeenCalledWith(event, context)
      expect(handler2).toHaveBeenCalledWith(event, context)
    })

    it('passes the correct event and context to handlers', () => {
      const handler = vi.fn()
      eventBus.on('pre_tool_use', handler)

      const event = createMockPreToolUseEvent({ tool: 'Bash' })
      const session = createMockSessionContext()
      const context = createMockContext({ session, soundEnabled: false })

      eventBus.emit('pre_tool_use', event, context)

      expect(handler).toHaveBeenCalledTimes(1)
      const [receivedEvent, receivedContext] = handler.mock.calls[0]
      expect(receivedEvent.tool).toBe('Bash')
      expect(receivedContext.soundEnabled).toBe(false)
      expect(receivedContext.session?.id).toBe('test-session-123')
    })

    it('does not call handlers for other event types', () => {
      const preHandler = vi.fn()
      const postHandler = vi.fn()
      eventBus.on('pre_tool_use', preHandler)
      eventBus.on('post_tool_use', postHandler)

      const event = createMockPreToolUseEvent()
      const context = createMockContext()
      eventBus.emit('pre_tool_use', event, context)

      expect(preHandler).toHaveBeenCalled()
      expect(postHandler).not.toHaveBeenCalled()
    })

    it('does nothing when no handlers are registered', () => {
      const event = createMockPreToolUseEvent()
      const context = createMockContext()

      // Should not throw
      expect(() => eventBus.emit('pre_tool_use', event, context)).not.toThrow()
    })

    it('catches and logs errors from handlers without stopping other handlers', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const errorHandler = vi.fn(() => {
        throw new Error('Handler error')
      })
      const successHandler = vi.fn()

      eventBus.on('pre_tool_use', errorHandler)
      eventBus.on('pre_tool_use', successHandler)

      const event = createMockPreToolUseEvent()
      const context = createMockContext()
      eventBus.emit('pre_tool_use', event, context)

      expect(errorHandler).toHaveBeenCalled()
      expect(successHandler).toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })
  })

  describe('off()', () => {
    it('removes all handlers for an event type', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      eventBus.on('pre_tool_use', handler1)
      eventBus.on('pre_tool_use', handler2)

      eventBus.off('pre_tool_use')
      expect(eventBus.getHandlerCount('pre_tool_use')).toBe(0)
    })

    it('does not affect handlers for other event types', () => {
      const preHandler = vi.fn()
      const postHandler = vi.fn()
      eventBus.on('pre_tool_use', preHandler)
      eventBus.on('post_tool_use', postHandler)

      eventBus.off('pre_tool_use')

      expect(eventBus.getHandlerCount('pre_tool_use')).toBe(0)
      expect(eventBus.getHandlerCount('post_tool_use')).toBe(1)
    })
  })

  describe('clear()', () => {
    it('removes all handlers for all event types', () => {
      eventBus.on('pre_tool_use', vi.fn())
      eventBus.on('post_tool_use', vi.fn())
      eventBus.on('stop', vi.fn())

      expect(eventBus.getHandlerCount()).toBe(3)

      eventBus.clear()
      expect(eventBus.getHandlerCount()).toBe(0)
    })
  })

  describe('getHandlerCount()', () => {
    it('returns 0 for event types with no handlers', () => {
      expect(eventBus.getHandlerCount('pre_tool_use')).toBe(0)
    })

    it('returns correct count for a specific event type', () => {
      eventBus.on('pre_tool_use', vi.fn())
      eventBus.on('pre_tool_use', vi.fn())
      eventBus.on('pre_tool_use', vi.fn())

      expect(eventBus.getHandlerCount('pre_tool_use')).toBe(3)
    })

    it('returns total count when no type specified', () => {
      eventBus.on('pre_tool_use', vi.fn())
      eventBus.on('pre_tool_use', vi.fn())
      eventBus.on('post_tool_use', vi.fn())
      eventBus.on('stop', vi.fn())

      expect(eventBus.getHandlerCount()).toBe(4)
    })
  })

  describe('integration scenarios', () => {
    it('handles a complete tool use cycle', () => {
      const preHandler = vi.fn()
      const postHandler = vi.fn()

      eventBus.on('pre_tool_use', preHandler)
      eventBus.on('post_tool_use', postHandler)

      const context = createMockContext({
        session: createMockSessionContext(),
      })

      // Pre-tool use
      const preEvent = createMockPreToolUseEvent({ tool: 'Read', toolUseId: 'toolu_abc' })
      eventBus.emit('pre_tool_use', preEvent, context)
      expect(preHandler).toHaveBeenCalledWith(preEvent, context)

      // Post-tool use
      const postEvent = createMockPostToolUseEvent({
        tool: 'Read',
        toolUseId: 'toolu_abc',
        success: true,
        duration: 150,
      })
      eventBus.emit('post_tool_use', postEvent, context)
      expect(postHandler).toHaveBeenCalledWith(postEvent, context)
    })

    it('handles stop event correctly', () => {
      const stopHandler = vi.fn()
      eventBus.on('stop', stopHandler)

      const stopEvent = createMockStopEvent({ response: 'Task completed successfully' })
      const context = createMockContext()
      eventBus.emit('stop', stopEvent, context)

      expect(stopHandler).toHaveBeenCalledWith(stopEvent, context)
    })
  })
})
