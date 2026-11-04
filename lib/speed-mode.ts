import type { SpeedMode } from './types'

export function isSpeedMode(value: unknown): value is SpeedMode {
  return value === 'normal' || value === 'fast' || value === 'ultrafast'
}
