/**
 * Event Injector Helper for E2E Tests
 *
 * Injects mock events via the HTTP /event endpoint for visual testing.
 * This allows tests to simulate Claude activity without running actual Claude.
 */

import type { APIRequestContext } from '@playwright/test'

// Event types (simplified for test purposes)
interface TestEvent {
  id: string
  type: string
  timestamp: number
  sessionId: string
  cwd: string
  [key: string]: unknown
}

const SERVER_URL = 'http://localhost:4003'

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Create an implicit session (required before events will create zones)
 * This mimics what happens when an external Claude session is detected
 */
export async function createImplicitSession(
  request: APIRequestContext,
  sessionId: string,
  cwd = '/test/project'
): Promise<boolean> {
  try {
    const response = await request.post(`${SERVER_URL}/sessions/implicit`, {
      data: {
        claudeSessionId: sessionId,
        cwd,
      },
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await response.json()
    return data.ok === true
  } catch {
    return false
  }
}

/**
 * Inject a single event into the server
 */
export async function injectEvent(
  request: APIRequestContext,
  event: Partial<TestEvent> & { type: string }
): Promise<void> {
  const fullEvent: TestEvent = {
    id: generateEventId(),
    timestamp: Date.now(),
    sessionId: 'test-session',
    cwd: '/test/project',
    ...event,
  }

  await request.post(`${SERVER_URL}/event`, {
    data: fullEvent,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Inject a session start event
 */
export async function injectSessionStart(
  request: APIRequestContext,
  sessionId = 'test-session',
  cwd = '/test/project'
): Promise<void> {
  await injectEvent(request, {
    type: 'session_start',
    sessionId,
    cwd,
    source: 'startup',
  })
}

/**
 * Inject a file read event (triggers file constellation update)
 */
export async function injectFileRead(
  request: APIRequestContext,
  filePath: string,
  sessionId = 'test-session'
): Promise<string> {
  const toolUseId = generateEventId()

  // Pre-tool event
  await injectEvent(request, {
    type: 'pre_tool_use',
    sessionId,
    tool: 'Read',
    toolUseId,
    toolInput: { file_path: filePath },
  })

  // Post-tool event (success)
  await injectEvent(request, {
    type: 'post_tool_use',
    sessionId,
    tool: 'Read',
    toolUseId,
    toolInput: { file_path: filePath },
    toolResponse: { content: '// file content...' },
    success: true,
    duration: 50,
  })

  return toolUseId
}

/**
 * Inject a file edit event (triggers file constellation update with diff)
 */
export async function injectFileEdit(
  request: APIRequestContext,
  filePath: string,
  linesAdded = 5,
  linesRemoved = 2,
  sessionId = 'test-session'
): Promise<string> {
  const toolUseId = generateEventId()

  // Pre-tool event
  await injectEvent(request, {
    type: 'pre_tool_use',
    sessionId,
    tool: 'Edit',
    toolUseId,
    toolInput: {
      file_path: filePath,
      old_string: 'original',
      new_string: 'modified',
    },
  })

  // Post-tool event with diff info
  await injectEvent(request, {
    type: 'post_tool_use',
    sessionId,
    tool: 'Edit',
    toolUseId,
    toolInput: {
      file_path: filePath,
      old_string: 'original',
      new_string: 'modified',
    },
    toolResponse: {
      success: true,
      linesAdded,
      linesRemoved,
    },
    success: true,
    duration: 100,
  })

  return toolUseId
}

/**
 * Inject multiple file touches to create a file constellation
 */
export async function injectFileConstellation(
  request: APIRequestContext,
  files: Array<{ path: string; linesAdded?: number; linesRemoved?: number }>,
  sessionId = 'test-session',
  cwd = '/test/project'
): Promise<void> {
  // Create implicit session first (required for zone creation)
  const created = await createImplicitSession(request, sessionId, cwd)
  if (!created) {
    console.warn('Failed to create implicit session, zone may not be created')
  }

  // Wait for session to be broadcast to clients
  await new Promise((resolve) => setTimeout(resolve, 500))

  // Start session event
  await injectSessionStart(request, sessionId, cwd)

  // Wait for zone to be created
  await new Promise((resolve) => setTimeout(resolve, 500))

  // Inject file touches
  for (const file of files) {
    if (file.linesAdded !== undefined || file.linesRemoved !== undefined) {
      await injectFileEdit(
        request,
        file.path,
        file.linesAdded ?? 0,
        file.linesRemoved ?? 0,
        sessionId
      )
    } else {
      await injectFileRead(request, file.path, sessionId)
    }

    // Small delay between events for processing
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/**
 * Inject a stop event (session finished)
 */
export async function injectStop(
  request: APIRequestContext,
  sessionId = 'test-session'
): Promise<void> {
  await injectEvent(request, {
    type: 'stop',
    sessionId,
    stopHookActive: true,
    response: 'Task completed.',
  })
}
