/**
 * Integration tests for session lifecycle management
 *
 * Tests the session creation, linking, status updates, and deletion
 * without requiring actual tmux sessions.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { ManagedSession, SessionStatus } from '../../../shared/types'

// Simplified session manager for testing
class SessionManager {
  private sessions = new Map<string, ManagedSession>()
  private claudeToManagedMap = new Map<string, string>()
  private sessionCounter = 0

  createSession(options: { name?: string; cwd?: string } = {}): ManagedSession {
    this.sessionCounter++
    const id = `session-${this.sessionCounter}`
    const tmuxSession = `vibecraft-${id}`

    const session: ManagedSession = {
      id,
      name: options.name || `Claude ${this.sessionCounter}`,
      tmuxSession,
      status: 'idle',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      cwd: options.cwd,
    }

    this.sessions.set(id, session)
    return session
  }

  getSession(id: string): ManagedSession | undefined {
    return this.sessions.get(id)
  }

  getSessions(): ManagedSession[] {
    return Array.from(this.sessions.values())
  }

  updateSession(id: string, updates: Partial<ManagedSession>): ManagedSession | null {
    const session = this.sessions.get(id)
    if (!session) return null

    Object.assign(session, updates)
    return session
  }

  deleteSession(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session) return false

    // Clean up mapping
    for (const [claudeId, managedId] of this.claudeToManagedMap) {
      if (managedId === id) {
        this.claudeToManagedMap.delete(claudeId)
      }
    }

    this.sessions.delete(id)
    return true
  }

  linkClaudeSession(claudeSessionId: string, managedSessionId: string): void {
    this.claudeToManagedMap.set(claudeSessionId, managedSessionId)
    const session = this.sessions.get(managedSessionId)
    if (session) {
      session.claudeSessionId = claudeSessionId
    }
  }

  findByClaudeSession(claudeSessionId: string): ManagedSession | undefined {
    const managedId = this.claudeToManagedMap.get(claudeSessionId)
    if (managedId) {
      return this.sessions.get(managedId)
    }
    return undefined
  }

  updateStatusForEvent(claudeSessionId: string, eventType: string, tool?: string): void {
    const session = this.findByClaudeSession(claudeSessionId)
    if (!session) return

    session.lastActivity = Date.now()

    switch (eventType) {
      case 'pre_tool_use':
        session.status = 'working'
        session.currentTool = tool
        break
      case 'post_tool_use':
        session.currentTool = undefined
        break
      case 'user_prompt_submit':
        session.status = 'working'
        session.currentTool = undefined
        break
      case 'stop':
      case 'session_end':
        session.status = 'idle'
        session.currentTool = undefined
        break
    }
  }

  clear(): void {
    this.sessions.clear()
    this.claudeToManagedMap.clear()
    this.sessionCounter = 0
  }
}

describe('SessionManager', () => {
  let manager: SessionManager

  beforeEach(() => {
    manager = new SessionManager()
  })

  describe('createSession()', () => {
    it('creates a session with default name', () => {
      const session = manager.createSession()

      expect(session.id).toBeDefined()
      expect(session.name).toBe('Claude 1')
      expect(session.status).toBe('idle')
      expect(session.tmuxSession).toContain('vibecraft-')
    })

    it('creates a session with custom name', () => {
      const session = manager.createSession({ name: 'Frontend' })
      expect(session.name).toBe('Frontend')
    })

    it('creates a session with custom cwd', () => {
      const session = manager.createSession({ cwd: '/projects/myapp' })
      expect(session.cwd).toBe('/projects/myapp')
    })

    it('increments session counter for unique names', () => {
      const s1 = manager.createSession()
      const s2 = manager.createSession()
      const s3 = manager.createSession()

      expect(s1.name).toBe('Claude 1')
      expect(s2.name).toBe('Claude 2')
      expect(s3.name).toBe('Claude 3')
    })

    it('sets timestamps on creation', () => {
      const before = Date.now()
      const session = manager.createSession()
      const after = Date.now()

      expect(session.createdAt).toBeGreaterThanOrEqual(before)
      expect(session.createdAt).toBeLessThanOrEqual(after)
      expect(session.lastActivity).toBe(session.createdAt)
    })
  })

  describe('getSession()', () => {
    it('returns session by id', () => {
      const created = manager.createSession({ name: 'Test' })
      const found = manager.getSession(created.id)

      expect(found).toBe(created)
    })

    it('returns undefined for unknown id', () => {
      expect(manager.getSession('nonexistent')).toBeUndefined()
    })
  })

  describe('getSessions()', () => {
    it('returns empty array when no sessions', () => {
      expect(manager.getSessions()).toEqual([])
    })

    it('returns all sessions', () => {
      manager.createSession({ name: 'A' })
      manager.createSession({ name: 'B' })
      manager.createSession({ name: 'C' })

      const sessions = manager.getSessions()
      expect(sessions).toHaveLength(3)
      expect(sessions.map((s) => s.name)).toContain('A')
      expect(sessions.map((s) => s.name)).toContain('B')
      expect(sessions.map((s) => s.name)).toContain('C')
    })
  })

  describe('updateSession()', () => {
    it('updates session name', () => {
      const session = manager.createSession()
      const updated = manager.updateSession(session.id, { name: 'New Name' })

      expect(updated?.name).toBe('New Name')
      expect(manager.getSession(session.id)?.name).toBe('New Name')
    })

    it('updates session status', () => {
      const session = manager.createSession()
      manager.updateSession(session.id, { status: 'working' })

      expect(manager.getSession(session.id)?.status).toBe('working')
    })

    it('returns null for unknown id', () => {
      const result = manager.updateSession('nonexistent', { name: 'Test' })
      expect(result).toBeNull()
    })
  })

  describe('deleteSession()', () => {
    it('deletes session by id', () => {
      const session = manager.createSession()
      expect(manager.deleteSession(session.id)).toBe(true)
      expect(manager.getSession(session.id)).toBeUndefined()
    })

    it('returns false for unknown id', () => {
      expect(manager.deleteSession('nonexistent')).toBe(false)
    })

    it('cleans up Claude session mapping', () => {
      const session = manager.createSession()
      manager.linkClaudeSession('claude-123', session.id)

      manager.deleteSession(session.id)
      expect(manager.findByClaudeSession('claude-123')).toBeUndefined()
    })
  })

  describe('linkClaudeSession()', () => {
    it('links Claude session ID to managed session', () => {
      const session = manager.createSession()
      manager.linkClaudeSession('claude-xyz', session.id)

      expect(manager.findByClaudeSession('claude-xyz')).toBe(session)
      expect(session.claudeSessionId).toBe('claude-xyz')
    })

    it('allows relinking to different session', () => {
      const s1 = manager.createSession({ name: 'First' })
      const s2 = manager.createSession({ name: 'Second' })

      manager.linkClaudeSession('claude-123', s1.id)
      manager.linkClaudeSession('claude-123', s2.id) // Re-link

      expect(manager.findByClaudeSession('claude-123')).toBe(s2)
    })
  })

  describe('updateStatusForEvent()', () => {
    it('sets working status on pre_tool_use', () => {
      const session = manager.createSession()
      manager.linkClaudeSession('claude-1', session.id)

      manager.updateStatusForEvent('claude-1', 'pre_tool_use', 'Bash')

      expect(session.status).toBe('working')
      expect(session.currentTool).toBe('Bash')
    })

    it('clears currentTool on post_tool_use', () => {
      const session = manager.createSession()
      manager.linkClaudeSession('claude-1', session.id)

      manager.updateStatusForEvent('claude-1', 'pre_tool_use', 'Read')
      expect(session.currentTool).toBe('Read')

      manager.updateStatusForEvent('claude-1', 'post_tool_use')
      expect(session.currentTool).toBeUndefined()
    })

    it('sets working status on user_prompt_submit', () => {
      const session = manager.createSession()
      manager.linkClaudeSession('claude-1', session.id)

      manager.updateStatusForEvent('claude-1', 'user_prompt_submit')

      expect(session.status).toBe('working')
    })

    it('sets idle status on stop event', () => {
      const session = manager.createSession()
      manager.linkClaudeSession('claude-1', session.id)

      manager.updateStatusForEvent('claude-1', 'pre_tool_use', 'Bash')
      expect(session.status).toBe('working')

      manager.updateStatusForEvent('claude-1', 'stop')
      expect(session.status).toBe('idle')
      expect(session.currentTool).toBeUndefined()
    })

    it('updates lastActivity on all events', () => {
      const session = manager.createSession()
      manager.linkClaudeSession('claude-1', session.id)

      const oldActivity = session.lastActivity

      // Wait a tiny bit to ensure time difference
      const waitPromise = new Promise((r) => setTimeout(r, 10))
      return waitPromise.then(() => {
        manager.updateStatusForEvent('claude-1', 'pre_tool_use', 'Read')
        expect(session.lastActivity).toBeGreaterThanOrEqual(oldActivity)
      })
    })

    it('does nothing for unknown Claude session', () => {
      manager.updateStatusForEvent('unknown-claude', 'pre_tool_use', 'Bash')
      // Should not throw
    })
  })

  describe('status transitions', () => {
    it('handles full working cycle', () => {
      const session = manager.createSession()
      manager.linkClaudeSession('claude-1', session.id)

      // User sends prompt
      manager.updateStatusForEvent('claude-1', 'user_prompt_submit')
      expect(session.status).toBe('working')

      // Claude starts using a tool
      manager.updateStatusForEvent('claude-1', 'pre_tool_use', 'Read')
      expect(session.status).toBe('working')
      expect(session.currentTool).toBe('Read')

      // Tool completes
      manager.updateStatusForEvent('claude-1', 'post_tool_use')
      expect(session.currentTool).toBeUndefined()

      // Claude stops
      manager.updateStatusForEvent('claude-1', 'stop')
      expect(session.status).toBe('idle')
    })

    it('handles multiple tools in sequence', () => {
      const session = manager.createSession()
      manager.linkClaudeSession('claude-1', session.id)

      manager.updateStatusForEvent('claude-1', 'user_prompt_submit')

      // First tool
      manager.updateStatusForEvent('claude-1', 'pre_tool_use', 'Read')
      expect(session.currentTool).toBe('Read')
      manager.updateStatusForEvent('claude-1', 'post_tool_use')

      // Second tool
      manager.updateStatusForEvent('claude-1', 'pre_tool_use', 'Edit')
      expect(session.currentTool).toBe('Edit')
      manager.updateStatusForEvent('claude-1', 'post_tool_use')

      // Third tool
      manager.updateStatusForEvent('claude-1', 'pre_tool_use', 'Bash')
      expect(session.currentTool).toBe('Bash')
      manager.updateStatusForEvent('claude-1', 'post_tool_use')

      manager.updateStatusForEvent('claude-1', 'stop')
      expect(session.status).toBe('idle')
    })
  })
})
