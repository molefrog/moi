import { mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const BASE_DECLARATION_SOURCE_PATH = join(import.meta.dir, 'declarations', 'base.d.ts')
export const COLLAB_DECLARATION_SOURCE_PATH = join(import.meta.dir, 'declarations', 'collab.d.ts')

export type AppletDeclarationFile = 'base.d.ts' | 'collab.d.ts'

export function appletDeclarationPath(workspacePath: string, file: AppletDeclarationFile): string {
  return join(workspacePath, '.moi', file)
}

async function writeDeclaration(
  workspacePath: string,
  file: AppletDeclarationFile
): Promise<boolean> {
  const sourcePath = join(import.meta.dir, 'declarations', file)
  const targetPath = appletDeclarationPath(workspacePath, file)
  const contents = await Bun.file(sourcePath).text()
  const target = Bun.file(targetPath)
  if ((await target.exists()) && (await target.text()) === contents) return false
  await mkdir(dirname(targetPath), { recursive: true })
  await Bun.write(targetPath, contents)
  return true
}

export async function syncAppletDeclarations(
  workspacePath: string
): Promise<AppletDeclarationFile[]> {
  const moiDir = join(workspacePath, '.moi')
  if (!(await stat(moiDir).catch(() => null))?.isDirectory()) return []

  const updated: AppletDeclarationFile[] = []
  if (await writeDeclaration(workspacePath, 'base.d.ts')) updated.push('base.d.ts')

  // Only an explicit collab install creates this optional declaration.
  if (await Bun.file(appletDeclarationPath(workspacePath, 'collab.d.ts')).exists()) {
    if (await writeDeclaration(workspacePath, 'collab.d.ts')) updated.push('collab.d.ts')
  }
  return updated
}

export async function installCollabDeclaration(workspacePath: string): Promise<void> {
  await writeDeclaration(workspacePath, 'base.d.ts')
  await writeDeclaration(workspacePath, 'collab.d.ts')
}
