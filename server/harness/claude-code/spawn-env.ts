// Every Claude Code subprocess — chat sessions, the session-title run, the
// model catalog, the MCP probe, and the auth status/login spawns — builds its
// environment here. `CLAUDECODE` is set inside a Claude Code session, and moi
// is often started from one (the INSTALL.md prompt does exactly that), so the
// server inherits it. Claude Code refuses to launch nested with that variable
// present, so it is always stripped; anything a caller passes in `extraEnv`
// (workspace env, `MOI_AGENT`, `DISABLE_AUTOUPDATER`) is applied first.
export function claudeSpawnEnv(
  extraEnv: Record<string, string | undefined> = {},
  parentEnv: Record<string, string | undefined> = process.env
): Record<string, string | undefined> {
  return { ...parentEnv, ...extraEnv, CLAUDECODE: undefined }
}
