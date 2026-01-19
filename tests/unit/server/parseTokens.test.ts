/**
 * Unit tests for token parsing logic
 *
 * Tests the parsing of token counts from Claude Code's tmux output.
 * The server polls tmux to extract token usage displayed in the UI.
 */

import { describe, it, expect } from 'vitest'

// Re-implement the token parsing function for testing
// (In production, this would be extracted to a separate module)

/**
 * Parse token count from Claude Code output
 * Patterns:
 *   ↓ 879 tokens
 *   ↓ 1,234 tokens
 *   ↓ 12.5k tokens
 *   ↓ 12k tokens
 */
function parseTokensFromOutput(output: string): number | null {
  const patterns = [
    /↓\s*([0-9,]+)\s*tokens?/gi, // ↓ 879 tokens, ↓ 1,234 tokens
    /↓\s*([0-9.]+)k\s*tokens?/gi, // ↓ 12.5k tokens, ↓ 12k tokens
  ]

  let maxTokens = 0

  // Pattern 1: plain numbers (possibly with commas)
  const plainMatches = output.matchAll(patterns[0])
  for (const match of plainMatches) {
    const num = parseInt(match[1].replace(/,/g, ''), 10)
    if (num > maxTokens) maxTokens = num
  }

  // Pattern 2: k suffix (thousands)
  const kMatches = output.matchAll(patterns[1])
  for (const match of kMatches) {
    const num = Math.round(parseFloat(match[1]) * 1000)
    if (num > maxTokens) maxTokens = num
  }

  return maxTokens > 0 ? maxTokens : null
}

describe('parseTokensFromOutput', () => {
  describe('plain number format', () => {
    it('parses simple token count', () => {
      expect(parseTokensFromOutput('↓ 879 tokens')).toBe(879)
    })

    it('parses token count with comma separators', () => {
      expect(parseTokensFromOutput('↓ 1,234 tokens')).toBe(1234)
    })

    it('parses larger numbers with multiple commas', () => {
      expect(parseTokensFromOutput('↓ 12,345,678 tokens')).toBe(12345678)
    })

    it('handles singular "token"', () => {
      expect(parseTokensFromOutput('↓ 1 token')).toBe(1)
    })

    it('handles varying whitespace', () => {
      expect(parseTokensFromOutput('↓  879  tokens')).toBe(879)
      expect(parseTokensFromOutput('↓879 tokens')).toBe(879)
    })
  })

  describe('k suffix format', () => {
    it('parses integer k values', () => {
      expect(parseTokensFromOutput('↓ 12k tokens')).toBe(12000)
    })

    it('parses decimal k values', () => {
      expect(parseTokensFromOutput('↓ 12.5k tokens')).toBe(12500)
    })

    it('parses small decimal k values', () => {
      expect(parseTokensFromOutput('↓ 1.2k tokens')).toBe(1200)
    })

    it('rounds decimal k values', () => {
      expect(parseTokensFromOutput('↓ 1.234k tokens')).toBe(1234)
    })

    it('handles k with no decimal', () => {
      expect(parseTokensFromOutput('↓ 5k tokens')).toBe(5000)
    })
  })

  describe('mixed content', () => {
    it('extracts token count from longer output', () => {
      const output = `
        Some random output here
        ↓ 879 tokens
        More stuff below
      `
      expect(parseTokensFromOutput(output)).toBe(879)
    })

    it('returns the maximum when multiple token counts appear', () => {
      const output = `
        ↓ 100 tokens
        ↓ 500 tokens
        ↓ 300 tokens
      `
      expect(parseTokensFromOutput(output)).toBe(500)
    })

    it('prefers larger value between plain and k format', () => {
      const output = `
        ↓ 500 tokens
        ↓ 1.5k tokens
      `
      expect(parseTokensFromOutput(output)).toBe(1500)
    })

    it('handles realistic Claude Code output', () => {
      const output = `
╭─ User ──────────────────────────────────────────────────────╮
│ What is 2 + 2?                                              │
╰─────────────────────────────────────────────────────────────╯
╭─ Response ──────────────────────────────────────────────────╮
│ 2 + 2 = 4                                                   │
╰─────────────────────────────────────────────────────────────╯
↓ 879 tokens                                     claude-opus-4
      `
      expect(parseTokensFromOutput(output)).toBe(879)
    })
  })

  describe('edge cases', () => {
    it('returns null when no token count found', () => {
      expect(parseTokensFromOutput('No tokens here')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(parseTokensFromOutput('')).toBeNull()
    })

    it('returns null when arrow but no number', () => {
      expect(parseTokensFromOutput('↓ tokens')).toBeNull()
    })

    it('ignores non-token numbers', () => {
      expect(parseTokensFromOutput('line 123 of file')).toBeNull()
    })

    it('handles zero tokens as null (no meaningful data)', () => {
      // If we somehow get "0 tokens", that's probably not real data
      expect(parseTokensFromOutput('↓ 0 tokens')).toBeNull()
    })

    it('is case insensitive for "tokens"', () => {
      expect(parseTokensFromOutput('↓ 879 Tokens')).toBe(879)
      expect(parseTokensFromOutput('↓ 879 TOKENS')).toBe(879)
    })
  })

  describe('real-world scenarios', () => {
    it('parses token count after conversation', () => {
      const output = `
> I've made the changes to the file.

↓ 3,456 tokens                                    claude-sonnet
>
      `
      expect(parseTokensFromOutput(output)).toBe(3456)
    })

    it('handles output with ANSI escape codes stripped', () => {
      // After stripping ANSI codes, the output should still parse
      const output = '↓ 1,234 tokens                   claude-opus-4'
      expect(parseTokensFromOutput(output)).toBe(1234)
    })

    it('extracts from status bar format', () => {
      const output = `↓ 15.2k tokens  |  session: claude-1234`
      expect(parseTokensFromOutput(output)).toBe(15200)
    })
  })
})
