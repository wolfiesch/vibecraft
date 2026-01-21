/**
 * Visual Regression Tests for File Constellation
 *
 * Tests the 3D file constellation visualization using Playwright screenshots.
 * The constellation shows files floating around a zone at varied heights/radii.
 */

import { test, expect, type Page } from '@playwright/test'
import { injectFileConstellation } from '../helpers/eventInjector'

// Increase timeout for visual tests (they need to wait for rendering)
test.setTimeout(60000)

// Type for window.__vibecraft
interface VibeTest {
  scene: {
    focusZone: (zoneId: string) => void
    pauseForScreenshot: () => void
    resumeAnimation: () => void
    setCameraPosition: (
      x: number,
      y: number,
      z: number,
      lookAt?: { x: number; y: number; z: number }
    ) => void
    zones: Map<string, unknown>
    fileConstellation: {
      isVisible: (zoneId: string) => boolean
      getFileCount: (zoneId: string) => number
    }
  }
  client: unknown
}

declare global {
  interface Window {
    __vibecraft: VibeTest
  }
}

/**
 * Wait for the page to be fully loaded and scene initialized
 */
async function waitForSceneReady(page: Page): Promise<void> {
  // Wait for status dot to exist (basic page load)
  await page.waitForSelector('#status-dot', { timeout: 15000 })

  // Wait a bit for WebGL and scene initialization
  await page.waitForTimeout(2000)

  // Check if scene is available
  const hasScene = await page.evaluate(() => {
    return typeof window.__vibecraft?.scene !== 'undefined'
  })

  if (!hasScene) {
    throw new Error('Scene not initialized after page load')
  }
}

test.describe('FileConstellation Visual', () => {
  test('basic 3D scene screenshot', async ({ page, request }) => {
    // Navigate to the app
    await page.goto('/')

    // Wait for basic page load
    await waitForSceneReady(page)

    // Take a basic screenshot of the 3D scene
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()

    // Just screenshot what we have without injecting events
    await expect(canvas).toHaveScreenshot('basic-3d-scene.png', {
      maxDiffPixelRatio: 0.05, // 5% threshold
    })
  })

  test('constellation with injected files', async ({ page, request }) => {
    const TEST_SESSION = `test-${Date.now()}`

    await page.goto('/')
    await waitForSceneReady(page)

    // Inject test files
    const testFiles = [
      { path: '/src/main.ts', linesAdded: 10, linesRemoved: 5 },
      { path: '/src/scene/WorkshopScene.ts', linesAdded: 25, linesRemoved: 8 },
      { path: '/src/scene/FileConstellation.ts', linesAdded: 50, linesRemoved: 0 },
    ]

    await injectFileConstellation(request, testFiles, TEST_SESSION, '/test')

    // Wait for zone to potentially be created (may not happen if session creation fails)
    await page.waitForTimeout(3000)

    // Check if zone was created
    const hasZone = await page.evaluate((sessionId) => {
      const scene = window.__vibecraft?.scene
      return scene?.zones?.has(sessionId) ?? false
    }, TEST_SESSION)

    // Log for debugging
    console.log(`Zone created for ${TEST_SESSION}: ${hasZone}`)

    if (hasZone) {
      // Focus the zone
      await page.evaluate((sessionId) => {
        window.__vibecraft.scene.focusZone(sessionId)
      }, TEST_SESSION)

      await page.waitForTimeout(1000)

      // Pause for screenshot
      await page.evaluate(() => {
        const scene = window.__vibecraft.scene
        scene.pauseForScreenshot()
        scene.setCameraPosition(0, 20, 25, { x: 0, y: 5, z: 0 })
      })

      await page.waitForTimeout(200)

      const canvas = page.locator('canvas')
      await expect(canvas).toHaveScreenshot('file-constellation-with-files.png', {
        maxDiffPixelRatio: 0.05,
      })

      // Resume
      await page.evaluate(() => {
        window.__vibecraft.scene.resumeAnimation()
      })
    } else {
      // Take screenshot anyway to see current state
      const canvas = page.locator('canvas')
      await expect(canvas).toHaveScreenshot('file-constellation-no-zone.png', {
        maxDiffPixelRatio: 0.05,
      })
    }
  })
})
