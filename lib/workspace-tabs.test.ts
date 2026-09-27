import { describe, expect, test } from 'bun:test'

import {
  isParamsRecord,
  isWorkspaceTabId,
  viewBuilderIdFromTab,
  viewBuilderTabId,
  viewIdFromTab,
  viewTabId
} from './workspace-tabs'

describe('isWorkspaceTabId', () => {
  test('accepts the static tabs', () => {
    expect(isWorkspaceTabId('overview')).toBe(true)
    expect(isWorkspaceTabId('agent')).toBe(true)
    expect(isWorkspaceTabId('scratchpad')).toBe(true)
  })

  test('accepts view and view-builder tabs with a non-empty id', () => {
    expect(isWorkspaceTabId('views/roadmap')).toBe(true)
    expect(isWorkspaceTabId('view-builders/abc123')).toBe(true)
    expect(isWorkspaceTabId('views/')).toBe(false)
    expect(isWorkspaceTabId('view-builders/')).toBe(false)
  })

  test('rejects everything else', () => {
    for (const tab of [
      'view:roadmap',
      'view-builder:abc',
      'views/a/b',
      'views/a?x=1',
      'views/%65vents'
    ]) {
      expect(isWorkspaceTabId(tab)).toBe(false)
    }
    expect(isWorkspaceTabId('')).toBe(false)
    expect(isWorkspaceTabId('widgets')).toBe(false)
    expect(isWorkspaceTabId('settings')).toBe(false)
    expect(isWorkspaceTabId('views:roadmap')).toBe(false)
    expect(isWorkspaceTabId(undefined)).toBe(false)
    expect(isWorkspaceTabId(null)).toBe(false)
    expect(isWorkspaceTabId(42)).toBe(false)
  })
})

describe('tab id round-trips', () => {
  test('view tabs', () => {
    expect(viewTabId('orders')).toBe('views/orders')
    expect(viewIdFromTab('views/orders')).toBe('orders')
    expect(viewIdFromTab('overview')).toBeNull()
    expect(viewIdFromTab('view-builders/x')).toBeNull()
  })

  test('view-builder tabs', () => {
    expect(viewBuilderTabId('abc')).toBe('view-builders/abc')
    expect(viewBuilderIdFromTab('view-builders/abc')).toBe('abc')
    expect(viewBuilderIdFromTab('views/abc')).toBeNull()
  })
})

describe('isParamsRecord', () => {
  test('accepts a plain object', () => {
    expect(isParamsRecord({})).toBe(true)
    expect(isParamsRecord({ a: 1, nested: { b: [1, 2] } })).toBe(true)
  })

  test('rejects non-object JSON values', () => {
    expect(isParamsRecord(null)).toBe(false)
    expect(isParamsRecord([1, 2])).toBe(false)
    expect(isParamsRecord('str')).toBe(false)
    expect(isParamsRecord(7)).toBe(false)
    expect(isParamsRecord(undefined)).toBe(false)
  })
})
