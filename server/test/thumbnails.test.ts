import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  getAppletThumbnailRecords,
  getThumbnailsDir,
  pruneAppletThumbnails,
  saveAppletThumbnails,
  serveAppletThumbnail
} from '../thumbnails'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'moi-thumbs-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const image = (text: string) => `data:image/webp;base64,${Buffer.from(text).toString('base64')}`

async function storedImage(kind: string, id: string): Promise<string | null> {
  const file = Bun.file(join(getThumbnailsDir(dir), `${kind}-${id}.webp`))
  return (await file.exists()) ? file.text() : null
}

describe('saveAppletThumbnails', () => {
  test('stores widget and view records in one index with image files beside it', async () => {
    await saveAppletThumbnails(dir, 'widget', [
      { id: 'one', revision: 'w1', image: image('one') },
      { id: 'two', revision: 'w2', image: image('two') }
    ])
    await saveAppletThumbnails(dir, 'view', [
      { id: 'dashboard', revision: 'v1', image: image('view'), captureMs: 420 }
    ])

    const records = await getAppletThumbnailRecords(dir)
    expect(records.map(record => `${record.kind}:${record.id}`)).toEqual([
      'widget:one',
      'widget:two',
      'view:dashboard'
    ])
    expect(records[2].captureMs).toBe(420)
    // Records never carry image bytes — those live only as files.
    expect(records.every(record => !('image' in record) && !('file' in record))).toBe(true)
    expect(await storedImage('widget', 'one')).toBe('one')
    expect(await storedImage('view', 'dashboard')).toBe('view')
  })

  test('replaces captures, preserves images on failure, and only touches fresh visits', async () => {
    await saveAppletThumbnails(dir, 'view', [
      { id: 'dashboard', revision: 'old-revision', image: image('old') }
    ])

    await saveAppletThumbnails(dir, 'view', [
      { id: 'dashboard', revision: 'new-revision', image: image('new'), captureMs: 50 }
    ])
    const [captured] = await getAppletThumbnailRecords(dir)
    expect(captured.revision).toBe('new-revision')
    expect(await storedImage('view', 'dashboard')).toBe('new')

    // A touch (no image) only bumps recency — revision and capture time stay.
    await saveAppletThumbnails(dir, 'view', [{ id: 'dashboard', revision: 'ignored-on-touch' }])
    const [touched] = await getAppletThumbnailRecords(dir)
    expect(touched.revision).toBe('new-revision')
    expect(touched.capturedAt).toBe(captured.capturedAt)
    expect(touched.viewedAt >= captured.viewedAt).toBe(true)

    // A failed attempt (null) records the new revision and duration but keeps
    // the previous image file, so a broken applet doesn't loop the capture.
    await saveAppletThumbnails(dir, 'view', [
      { id: 'dashboard', revision: 'failed-revision', image: null, captureMs: 9_000 }
    ])
    const [failed] = await getAppletThumbnailRecords(dir)
    expect(failed.revision).toBe('failed-revision')
    expect(failed.captureMs).toBe(9_000)
    expect(await storedImage('view', 'dashboard')).toBe('new')
  })

  test('rejects images that are not inline webp/png/jpeg data URLs', async () => {
    await saveAppletThumbnails(dir, 'widget', [
      { id: 'evil', revision: 'r', image: 'not-a-data-url' }
    ])
    expect(await getAppletThumbnailRecords(dir)).toEqual([])
  })
})

describe('pruneAppletThumbnails', () => {
  test('drops records and files of deleted applets, same kind only', async () => {
    await saveAppletThumbnails(dir, 'widget', [
      { id: 'kept', revision: 'r', image: image('kept') },
      { id: 'gone', revision: 'r', image: image('gone') }
    ])
    await saveAppletThumbnails(dir, 'view', [{ id: 'gone', revision: 'r', image: image('view') }])

    await pruneAppletThumbnails(dir, 'widget', ['kept'])

    const records = await getAppletThumbnailRecords(dir)
    expect(records.map(record => `${record.kind}:${record.id}`)).toEqual([
      'widget:kept',
      'view:gone'
    ])
    expect(await storedImage('widget', 'gone')).toBeNull()
    expect(await storedImage('view', 'gone')).toBe('view')
  })
})

describe('serveAppletThumbnail', () => {
  test('serves the image with an ETag and answers a match with 304', async () => {
    await saveAppletThumbnails(dir, 'widget', [
      { id: 'clock', revision: 'r', image: image('clock') }
    ])

    const response = await serveAppletThumbnail(dir, 'widget', 'clock')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/webp')
    expect(response.headers.get('Cache-Control')).toBe('private, no-cache')
    expect(await response.text()).toBe('clock')

    const etag = response.headers.get('ETag')
    expect(etag).toBeTruthy()
    const revalidated = await serveAppletThumbnail(dir, 'widget', 'clock', etag)
    expect(revalidated.status).toBe(304)
  })

  test('404s unknown applets and 400s invalid ids', async () => {
    expect((await serveAppletThumbnail(dir, 'widget', 'nope')).status).toBe(404)
    expect((await serveAppletThumbnail(dir, 'widget', '../escape')).status).toBe(400)
  })
})
