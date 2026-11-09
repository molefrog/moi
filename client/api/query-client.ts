import { QueryClient } from '@tanstack/query-core'

// Shared with the host API so it can populate workspace members before React mounts
// and clear cached members when the account changes.
export const queryClient = new QueryClient()
