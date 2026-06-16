// Returns the worker's cwd so a test can assert chdir() restored it to the
// workspace root after the neutral spawn.
export async function getCwd(): Promise<string> {
  return process.cwd()
}
