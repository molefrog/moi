import { describe, expect, test } from 'bun:test'

import {
  isParamsRecord,
  isWorkspaceTabId,
  parseWorkspaceTab,
  readAppletParams,
  viewBuilderIdFromTab,
  viewBuilderTabId,
  viewIdFromTab,
  viewTabId,
  workspaceTabPath
} from './workspace-tabs'

describe('isWorkspaceTabId', () => {
  test('accepts the static tabs', () => {
    expect(isWorkspaceTabId('agent')).toBe(true)
    expect(isWorkspaceTabId('widgets')).toBe(true)
    expect(isWorkspaceTabId('scratchpad')).toBe(true)
  })

  test('accepts view and view-builder tabs with a non-empty id', () => {
    expect(isWorkspaceTabId('view:roadmap')).toBe(true)
    expect(isWorkspaceTabId('view-builder:abc123')).toBe(true)
    expect(isWorkspaceTabId('view:')).toBe(false)
    expect(isWorkspaceTabId('view-builder:')).toBe(false)
  })

  test('rejects everything else', () => {
    expect(isWorkspaceTabId('')).toBe(false)
    expect(isWorkspaceTabId('settings')).toBe(false)
    expect(isWorkspaceTabId('views:roadmap')).toBe(false)
    expect(isWorkspaceTabId(undefined)).toBe(false)
    expect(isWorkspaceTabId(null)).toBe(false)
    expect(isWorkspaceTabId(42)).toBe(false)
  })
})

describe('parseWorkspaceTab', () => {
  test('returns the tab id for a valid segment', () => {
    expect(parseWorkspaceTab('view:orders')).toBe('view:orders')
    expect(parseWorkspaceTab('agent')).toBe('agent')
  })

  test('returns null for missing or invalid segments', () => {
    expect(parseWorkspaceTab(undefined)).toBeNull()
    expect(parseWorkspaceTab(null)).toBeNull()
    expect(parseWorkspaceTab('')).toBeNull()
    expect(parseWorkspaceTab('nope')).toBeNull()
    // A wildcard can span segments — that is never a tab id.
    expect(parseWorkspaceTab('view:a/b')).toBeNull()
  })
})

describe('workspaceTabPath', () => {
  test('builds the tab URL', () => {
    expect(workspaceTabPath('ws1', 'view:roadmap')).toBe('/workspace/ws1/view:roadmap')
    expect(workspaceTabPath('ws1', 'agent')).toBe('/workspace/ws1/agent')
  })
})

describe('tab id round-trips', () => {
  test('view tabs', () => {
    expect(viewTabId('orders')).toBe('view:orders')
    expect(viewIdFromTab('view:orders')).toBe('orders')
    expect(viewIdFromTab('widgets')).toBeNull()
    expect(viewIdFromTab('view-builder:x')).toBeNull()
  })

  test('view-builder tabs', () => {
    expect(viewBuilderTabId('abc')).toBe('view-builder:abc')
    expect(viewBuilderIdFromTab('view-builder:abc')).toBe('abc')
    expect(viewBuilderIdFromTab('view:abc')).toBeNull()
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

describe('readAppletParams', () => {
  test('reads params out of navigation state', () => {
    expect(readAppletParams({ appletParams: { order: 'o-1' } })).toEqual({ order: 'o-1' })
  })

  test('degrades to {} for anything malformed', () => {
    expect(readAppletParams(null)).toEqual({})
    expect(readAppletParams(undefined)).toEqual({})
    expect(readAppletParams({})).toEqual({})
    expect(readAppletParams({ appletParams: [1] })).toEqual({})
    expect(readAppletParams({ appletParams: 'x' })).toEqual({})
    expect(readAppletParams('state')).toEqual({})
  })
})
