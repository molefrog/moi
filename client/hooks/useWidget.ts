import type { ComponentType } from 'react'
import { useCallback, useEffect, useState } from 'react'

import { useMeiEvent } from './useMeiEvents'

type WidgetState =
  | { status: 'loading' }
  | { status: 'ready'; Component: ComponentType }
  | { status: 'error'; error: string }

const moduleCache = new Map<string, Promise<ComponentType>>()
let version = 0

function loadWidget(name: string, bust: boolean): Promise<ComponentType> {
  if (bust) {
    moduleCache.delete(name)
    version++
  }

  const existing = moduleCache.get(name)
  if (existing) return existing

  // Cache-busting query param so the browser fetches fresh
  const url = `/_mei/widgets/${name}.js?v=${version}`
  const promise = import(/* @vite-ignore */ url).then((mod) => {
    if (!mod.default) throw new Error(`Widget "${name}" has no default export`)
    return mod.default as ComponentType
  })

  moduleCache.set(name, promise)
  return promise
}

export function useWidget(name: string): WidgetState {
  const [state, setState] = useState<WidgetState>({ status: 'loading' })

  const load = useCallback(
    (bust = false) => {
      setState({ status: 'loading' })
      loadWidget(name, bust)
        .then((Component) => setState({ status: 'ready', Component }))
        .catch((err) => setState({ status: 'error', error: String(err) }))
    },
    [name]
  )

  useEffect(() => {
    load()
  }, [load])

  // Reload when server says this widget was updated
  useMeiEvent((event) => {
    if (event.type === 'widget:updated' && event.name === name) {
      load(true)
    }
  })

  return state
}
