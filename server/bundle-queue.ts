const bundleChains = new Map<string, Promise<unknown>>()

export function serializeWorkspaceBundle<T>(
  workspacePath: string,
  run: () => Promise<T>
): Promise<T> {
  const previous = bundleChains.get(workspacePath) ?? Promise.resolve()
  const current = previous.then(run, run)
  bundleChains.set(workspacePath, current)
  void current.then(
    () => {
      if (bundleChains.get(workspacePath) === current) bundleChains.delete(workspacePath)
    },
    () => {
      if (bundleChains.get(workspacePath) === current) bundleChains.delete(workspacePath)
    }
  )
  return current
}
