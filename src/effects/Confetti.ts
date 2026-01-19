/**
 * Confetti Particle System
 *
 * Creates celebratory confetti bursts for achievements like git commits.
 * Uses THREE.Points for efficient particle rendering with:
 * - Rainbow colors for celebration vibes
 * - Gravity physics with upward burst
 * - Fade out over duration
 * - Auto-dispose after animation completes
 */

import * as THREE from 'three'

/** Rainbow colors for celebration */
const CONFETTI_COLORS = [
  0xff4444, // Red
  0xff8844, // Orange
  0xffdd44, // Yellow
  0x44ff88, // Green
  0x44aaff, // Blue
  0xaa44ff, // Purple
  0xff44aa, // Pink
]

/** Options for confetti burst */
export interface ConfettiOptions {
  /** Number of particles (default: 80) */
  count?: number
  /** Colors to use (default: rainbow) */
  colors?: number[]
  /** Duration in seconds (default: 2.5) */
  duration?: number
  /** Spread angle in radians (default: Math.PI / 4) */
  spread?: number
  /** Initial upward velocity (default: 8) */
  burstForce?: number
}

/** Internal confetti burst state */
interface ConfettiBurst {
  points: THREE.Points
  velocities: Float32Array
  rotations: Float32Array
  rotationSpeeds: Float32Array
  startTime: number
  duration: number
  initialY: number
}

/**
 * ConfettiSystem manages celebratory particle effects
 */
export class ConfettiSystem {
  private scene: THREE.Scene
  private activeBursts: ConfettiBurst[] = []
  private disposed = false

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /**
   * Trigger a confetti burst at a position
   */
  burst(position: THREE.Vector3, options: ConfettiOptions = {}): void {
    if (this.disposed) return

    const {
      count = 80,
      colors = CONFETTI_COLORS,
      duration = 2.5,
      spread = Math.PI / 4,
      burstForce = 8,
    } = options

    // Create geometry
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const colorData = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const velocities = new Float32Array(count * 3)
    const rotations = new Float32Array(count)
    const rotationSpeeds = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const i3 = i * 3

      // Start at burst position with small random offset
      positions[i3] = position.x + (Math.random() - 0.5) * 0.2
      positions[i3 + 1] = position.y + Math.random() * 0.3
      positions[i3 + 2] = position.z + (Math.random() - 0.5) * 0.2

      // Random velocity: burst upward with spread
      const angle = Math.random() * Math.PI * 2
      const spreadAngle = (Math.random() - 0.5) * spread
      const upForce = burstForce * (0.7 + Math.random() * 0.6)
      velocities[i3] = Math.cos(angle) * Math.sin(spreadAngle) * upForce * 0.5
      velocities[i3 + 1] = upForce * Math.cos(spreadAngle)
      velocities[i3 + 2] = Math.sin(angle) * Math.sin(spreadAngle) * upForce * 0.5

      // Random color from palette
      const color = new THREE.Color(colors[Math.floor(Math.random() * colors.length)])
      colorData[i3] = color.r
      colorData[i3 + 1] = color.g
      colorData[i3 + 2] = color.b

      // Random size (small confetti pieces)
      sizes[i] = 0.08 + Math.random() * 0.12

      // Random rotation
      rotations[i] = Math.random() * Math.PI * 2
      rotationSpeeds[i] = (Math.random() - 0.5) * 10
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colorData, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    // Create material with vertex colors
    const material = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    const points = new THREE.Points(geometry, material)
    this.scene.add(points)

    const burst: ConfettiBurst = {
      points,
      velocities,
      rotations,
      rotationSpeeds,
      startTime: performance.now(),
      duration: duration * 1000,
      initialY: position.y,
    }

    this.activeBursts.push(burst)
  }

  /**
   * Update all active confetti bursts (call each frame)
   */
  update(deltaTime: number): void {
    if (this.disposed) return

    const now = performance.now()
    const gravity = -15 // Gravity acceleration
    const airResistance = 0.98 // Slow down horizontal movement

    // Update each burst
    for (let b = this.activeBursts.length - 1; b >= 0; b--) {
      const burst = this.activeBursts[b]
      const elapsed = now - burst.startTime
      const progress = elapsed / burst.duration

      if (progress >= 1) {
        // Burst complete - remove
        this.scene.remove(burst.points)
        burst.points.geometry.dispose()
        ;(burst.points.material as THREE.Material).dispose()
        this.activeBursts.splice(b, 1)
        continue
      }

      // Update particle positions
      const positions = burst.points.geometry.attributes.position.array as Float32Array
      const count = positions.length / 3

      for (let i = 0; i < count; i++) {
        const i3 = i * 3

        // Apply velocity
        positions[i3] += burst.velocities[i3] * deltaTime
        positions[i3 + 1] += burst.velocities[i3 + 1] * deltaTime
        positions[i3 + 2] += burst.velocities[i3 + 2] * deltaTime

        // Apply gravity to vertical velocity
        burst.velocities[i3 + 1] += gravity * deltaTime

        // Apply air resistance to horizontal movement
        burst.velocities[i3] *= airResistance
        burst.velocities[i3 + 2] *= airResistance

        // Add slight flutter effect
        const flutter = Math.sin(elapsed * 0.01 + i) * 0.3
        burst.velocities[i3] += flutter * deltaTime
        burst.velocities[i3 + 2] += Math.cos(elapsed * 0.01 + i) * 0.2 * deltaTime

        // Update rotation
        burst.rotations[i] += burst.rotationSpeeds[i] * deltaTime
      }

      // Update opacity (fade out in last 30%)
      const fadeStart = 0.7
      if (progress > fadeStart) {
        const fadeProgress = (progress - fadeStart) / (1 - fadeStart)
        ;(burst.points.material as THREE.PointsMaterial).opacity = 1 - fadeProgress
      }

      // Mark geometry for update
      burst.points.geometry.attributes.position.needsUpdate = true
    }
  }

  /**
   * Check if any confetti is currently active
   */
  isActive(): boolean {
    return this.activeBursts.length > 0
  }

  /**
   * Get number of active bursts
   */
  getActiveBurstCount(): number {
    return this.activeBursts.length
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    this.disposed = true

    for (const burst of this.activeBursts) {
      this.scene.remove(burst.points)
      burst.points.geometry.dispose()
      ;(burst.points.material as THREE.Material).dispose()
    }

    this.activeBursts = []
  }
}

// Export singleton creator for convenience
let confettiInstance: ConfettiSystem | null = null

export function getConfettiSystem(scene: THREE.Scene): ConfettiSystem {
  // Check if scene changed - if so, dispose old instance and create new one
  if (confettiInstance && confettiInstance['scene'] !== scene) {
    confettiInstance.dispose()
    confettiInstance = null
  }
  if (!confettiInstance) {
    confettiInstance = new ConfettiSystem(scene)
  }
  return confettiInstance
}

export function disposeConfettiSystem(): void {
  if (confettiInstance) {
    confettiInstance.dispose()
    confettiInstance = null
  }
}
