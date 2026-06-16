// Reads an env var so a test can assert the workspace `.env` is NOT auto-loaded
// by Bun (only moi's injected env reaches the worker).
export async function readSentinel(): Promise<string | null> {
  return process.env.MOI_LEAK_SENTINEL ?? null
}
