// Unique per browser tab (page load). Writes send it as `origin`; the server echoes it on the
// resulting broadcast so the writing tab can skip its own echo (it already shows
// the change optimistically, and a refetch could land an older value over it).
export const BROWSER_TAB_ID = Math.random().toString(36).slice(2)
