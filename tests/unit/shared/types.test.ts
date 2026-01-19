/**
 * Unit tests for shared/types.ts
 *
 * Tests the tool station mapping logic that drives Claude's movement
 * to different workstations in the 3D workshop.
 */

import { describe, it, expect } from 'vitest'
import { getStationForTool, TOOL_STATION_MAP, StationType } from '../../../shared/types'

describe('TOOL_STATION_MAP', () => {
  it('contains all core tools', () => {
    const coreTools = [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Grep',
      'Glob',
      'WebFetch',
      'WebSearch',
      'Task',
      'TodoWrite',
      'AskUserQuestion',
      'NotebookEdit',
    ]

    for (const tool of coreTools) {
      expect(TOOL_STATION_MAP[tool]).toBeDefined()
    }
  })

  it('maps Read tool to bookshelf station', () => {
    expect(TOOL_STATION_MAP['Read']).toBe('bookshelf')
  })

  it('maps Write tool to desk station', () => {
    expect(TOOL_STATION_MAP['Write']).toBe('desk')
  })

  it('maps Edit tool to workbench station', () => {
    expect(TOOL_STATION_MAP['Edit']).toBe('workbench')
  })

  it('maps Bash tool to terminal station', () => {
    expect(TOOL_STATION_MAP['Bash']).toBe('terminal')
  })

  it('maps search tools (Grep, Glob) to scanner station', () => {
    expect(TOOL_STATION_MAP['Grep']).toBe('scanner')
    expect(TOOL_STATION_MAP['Glob']).toBe('scanner')
  })

  it('maps web tools (WebFetch, WebSearch) to antenna station', () => {
    expect(TOOL_STATION_MAP['WebFetch']).toBe('antenna')
    expect(TOOL_STATION_MAP['WebSearch']).toBe('antenna')
  })

  it('maps Task tool to portal station', () => {
    expect(TOOL_STATION_MAP['Task']).toBe('portal')
  })

  it('maps TodoWrite tool to taskboard station', () => {
    expect(TOOL_STATION_MAP['TodoWrite']).toBe('taskboard')
  })

  it('maps AskUserQuestion to center station', () => {
    expect(TOOL_STATION_MAP['AskUserQuestion']).toBe('center')
  })

  it('maps NotebookEdit to desk station', () => {
    expect(TOOL_STATION_MAP['NotebookEdit']).toBe('desk')
  })
})

describe('getStationForTool', () => {
  it('returns correct station for known tools', () => {
    expect(getStationForTool('Read')).toBe('bookshelf')
    expect(getStationForTool('Edit')).toBe('workbench')
    expect(getStationForTool('Bash')).toBe('terminal')
    expect(getStationForTool('Task')).toBe('portal')
  })

  it('returns center for unknown tools', () => {
    expect(getStationForTool('UnknownTool')).toBe('center')
    expect(getStationForTool('RandomTool')).toBe('center')
    expect(getStationForTool('')).toBe('center')
  })

  it('returns center for MCP browser tools', () => {
    // MCP tools (browser automation) should stay at center to avoid
    // overwriting real tool movements
    expect(getStationForTool('mcp__browser__click')).toBe('center')
    expect(getStationForTool('mcp__playwright__navigate')).toBe('center')
    expect(getStationForTool('mcp__claude-in-chrome__screenshot')).toBe('center')
  })

  it('handles case sensitivity correctly', () => {
    // Tool names are case-sensitive - "read" is not the same as "Read"
    expect(getStationForTool('read')).toBe('center')
    expect(getStationForTool('READ')).toBe('center')
    expect(getStationForTool('Read')).toBe('bookshelf')
  })

  it('returns valid StationType for all mapped tools', () => {
    const validStations: StationType[] = [
      'center',
      'bookshelf',
      'desk',
      'workbench',
      'terminal',
      'scanner',
      'antenna',
      'portal',
      'taskboard',
    ]

    for (const tool of Object.keys(TOOL_STATION_MAP)) {
      const station = getStationForTool(tool)
      expect(validStations).toContain(station)
    }
  })
})
