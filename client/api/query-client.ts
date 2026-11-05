import { QueryClient } from '@tanstack/query-core'

// Created before React mounts so an embedding host can publish initial data.
export const queryClient = new QueryClient()
