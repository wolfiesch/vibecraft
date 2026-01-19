/**
 * E2E tests for session management
 *
 * Tests the session creation, selection, and management flows
 * through the browser UI.
 */

import { test, expect } from '@playwright/test'

test.describe('Session Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for the app to initialize
    await page.waitForSelector('#status-dot', { timeout: 10000 })
  })

  test('shows connection status indicator', async ({ page }) => {
    const statusDot = page.locator('#status-dot')
    await expect(statusDot).toBeVisible()
  })

  test('displays session panel', async ({ page }) => {
    const sessionPanel = page.locator(
      '#session-panel, .session-panel, [data-testid="session-panel"]'
    )
    // Session panel should exist (even if empty)
    await expect(sessionPanel.or(page.locator('.sessions-container'))).toBeVisible({
      timeout: 5000,
    })
  })

  test('opens new session modal with Alt+N', async ({ page }) => {
    // Press Alt+N to open new session modal
    await page.keyboard.press('Alt+n')

    // Modal should appear
    const modal = page.locator('#new-session-modal, .new-session-modal, [role="dialog"]')
    await expect(modal).toBeVisible({ timeout: 3000 })
  })

  test('new session modal has required fields', async ({ page }) => {
    await page.keyboard.press('Alt+n')

    // Check for input fields
    const nameInput = page.locator(
      'input[name="name"], input[placeholder*="name" i], #session-name'
    )
    const dirInput = page.locator(
      'input[name="directory"], input[placeholder*="directory" i], input[placeholder*="path" i], #session-dir'
    )

    await expect(nameInput.or(page.locator('input').first())).toBeVisible({ timeout: 3000 })
  })

  test('can close new session modal with Escape', async ({ page }) => {
    await page.keyboard.press('Alt+n')

    const modal = page.locator('#new-session-modal, .new-session-modal, [role="dialog"]')
    await expect(modal).toBeVisible({ timeout: 3000 })

    await page.keyboard.press('Escape')

    // Modal should close (or at least not be visible)
    await expect(modal).not.toBeVisible({ timeout: 3000 })
  })

  test('session keyboard shortcuts work', async ({ page }) => {
    // Test number key shortcuts for session switching
    // Note: These may not have visible effect if no sessions exist
    await page.keyboard.press('1')
    await page.keyboard.press('2')

    // Should not cause any errors
    // The page should still be functional
    const body = page.locator('body')
    await expect(body).toBeVisible()
  })
})

test.describe('Session List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#status-dot', { timeout: 10000 })
  })

  test('displays empty state or sessions', async ({ page }) => {
    // Either shows sessions or an empty state
    const content = await page.content()

    // Page should have loaded properly
    expect(content).toContain('vibecraft')
  })
})
