// Validate a workspace folder name as one safe path segment. Shared by the
// server endpoint and the client form so instant feedback cannot drift from the
// authoritative create path.
export function validateWorkspaceFolderName(name: string): string | null {
  if (!name) return 'Folder name is required'
  if (name.length > 64) return 'Folder name is too long (max 64 characters)'
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(name)) {
    return 'Use letters, numbers, dots, dashes, underscores and spaces, starting with a letter or number'
  }
  if (name.endsWith('.') || name.endsWith(' ')) {
    return 'Folder name cannot end with a dot or space'
  }
  return null
}
