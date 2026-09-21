// Baked into applet bundles wherever a runtime URL needs the workspace API
// base. The serve route replaces it with `/api/workspaces/<id>` so bundles stay
// workspace-agnostic on disk.
export const APPLET_API_BASE_SENTINEL = '%%MOI_APPLET_API_BASE%%'
