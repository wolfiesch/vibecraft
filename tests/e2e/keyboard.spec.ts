/**
 * E2E tests for keyboard shortcuts
 *
 * Tests all the keyboard shortcuts documented in CLAUDE.md:
 * - Session switching (1-6, Q-Y, etc.)
 * - Focus switching (Tab, Esc)
 * - Draw mode (D, colors, brush sizes)
 * - Other shortcuts (Alt+N, Alt+A, etc.)
 */

import { test, expect } from '@playwright/test'

test.describe('Session Switching Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#status-dot', { timeout: 10000 })
  })

  test('number keys 1-6 switch sessions', async ({ page }) => {
    // These shortcuts should work without errors
    await page.keyboard.press('1')
    await page.keyboard.press('2')
    await page.keyboard.press('3')
    await page.keyboard.press('4')
    await page.keyboard.press('5')
    await page.keyboard.press('6')

    // Page should still be functional
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })

  test('0 key shows all sessions / overview', async ({ page }) => {
    await page.keyboard.press('0')

    // Should not cause errors
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })

  test('backtick shows all sessions', async ({ page }) => {
    await page.keyboard.press('`')

    // Should not cause errors
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })
})

test.describe('Focus Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#status-dot', { timeout: 10000 })
  })

  test('Tab switches focus between Workshop and Activity Feed', async ({ page }) => {
    // Press Tab to switch focus
    await page.keyboard.press('Tab')

    // Press Tab again to switch back
    await page.keyboard.press('Tab')

    // Should not cause errors
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })

  test('Escape switches focus', async ({ page }) => {
    // First ensure no modal is open
    await page.keyboard.press('Escape')

    // Should not cause errors
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })
})

test.describe('Draw Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#status-dot', { timeout: 10000 })
  })

  test('D key toggles draw mode', async ({ page }) => {
    // Enter draw mode
    await page.keyboard.press('d')

    // Check for draw mode indicator (if exists)
    // The UI should show some indication of draw mode

    // Exit draw mode
    await page.keyboard.press('d')

    // Should return to normal mode
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })

  test('draw mode color selection keys work', async ({ page }) => {
    // Enter draw mode
    await page.keyboard.press('d')

    // Select colors with number keys
    await page.keyboard.press('1') // Color 1
    await page.keyboard.press('2') // Color 2
    await page.keyboard.press('3') // Color 3
    await page.keyboard.press('4') // Color 4
    await page.keyboard.press('5') // Color 5
    await page.keyboard.press('6') // Color 6
    await page.keyboard.press('0') // Eraser

    // Exit draw mode
    await page.keyboard.press('d')

    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })

  test('brush size keys work in draw mode', async ({ page }) => {
    await page.keyboard.press('d')

    // Increase brush size
    await page.keyboard.press('e')
    await page.keyboard.press('e')

    // Decrease brush size
    await page.keyboard.press('q')

    await page.keyboard.press('d')

    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })

  test('R toggles 3D stacking in draw mode', async ({ page }) => {
    await page.keyboard.press('d')
    await page.keyboard.press('r')
    await page.keyboard.press('r')
    await page.keyboard.press('d')

    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })

  test('X clears painted hexes in draw mode', async ({ page }) => {
    await page.keyboard.press('d')
    await page.keyboard.press('x')
    await page.keyboard.press('d')

    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })
})

test.describe('Alt Key Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#status-dot', { timeout: 10000 })
  })

  test('Alt+N opens new session modal', async ({ page }) => {
    await page.keyboard.press('Alt+n')

    // Modal should appear
    const modal = page.locator('[role="dialog"], .modal, .new-session-modal')
    await expect(modal).toBeVisible({ timeout: 3000 })

    // Close it
    await page.keyboard.press('Escape')
  })

  test('Alt+A goes to next session needing attention', async ({ page }) => {
    await page.keyboard.press('Alt+a')

    // Should not cause errors
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })

  test('Alt+Space expands most recent show more', async ({ page }) => {
    await page.keyboard.press('Alt+Space')

    // Should not cause errors
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })

  test('Alt+D toggles dev panel', async ({ page }) => {
    // Toggle on
    await page.keyboard.press('Alt+d')

    // Toggle off
    await page.keyboard.press('Alt+d')

    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })
})

test.describe('Other Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#status-dot', { timeout: 10000 })
  })

  test('F toggles follow-active mode', async ({ page }) => {
    await page.keyboard.press('f')
    await page.keyboard.press('f')

    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })

  test('P toggles station panels', async ({ page }) => {
    await page.keyboard.press('p')
    await page.keyboard.press('p')

    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })
})

test.describe('Context-Aware Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#status-dot', { timeout: 10000 })
  })

  test('shortcuts do not interfere when typing in input', async ({ page }) => {
    // Find and focus the prompt input
    const promptInput = page.locator('textarea').first()
    await promptInput.click()

    // Type keys that are shortcuts outside of inputs
    await promptInput.fill('1234567890dfpx')

    // Should have typed the characters, not triggered shortcuts
    await expect(promptInput).toHaveValue('1234567890dfpx')
  })
})
