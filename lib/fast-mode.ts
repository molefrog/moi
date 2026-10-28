import type { FastMode } from './types'

export function isFastMode(value: unknown): value is FastMode {
  return typeof value === 'boolean' || value === 'ultrafast'
}
