import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import externalizeReact from '@/client/externalize-react'

test('host bridge boots before React has been preloaded', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moi-bridge-boot-'))
  try {
    const build = await Bun.build({
      entrypoints: [join(import.meta.dir, 'host-api.ts')],
      target: 'browser',
      outdir: directory,
      plugins: [externalizeReact]
    })
    expect(build.success).toBe(true)
    const source = `
      if (globalThis.__esm) throw new Error('Test requires React to be absent');
      globalThis.window = {};
      const { installIdentityHostApi } = await import(${JSON.stringify(build.outputs[0]!.path)});
      installIdentityHostApi();
      const api = window.moi;
      if (api.collab) throw new Error('Legacy API leaked');
      api.identity.set({ id: 'user', type: 'user', name: 'Name', email: 'name@example.com', isAnonymous: false });
      api.workspaceMembers.setAll([
        { id: 'workspace', members: [], invitations: [] },
        { id: 'second', members: [], invitations: [] }
      ]);
      if (api.identity.getRevision() < 1 || !api.workspaceMembers.getRevision('workspace') || !api.workspaceMembers.getRevision('second')) throw new Error('Direct host calls must initialize before React');
      process.exit(0);
    `
    const child = Bun.spawn([process.execPath, '--eval', source], {
      stdout: 'pipe',
      stderr: 'pipe'
    })
    const [status, error] = await Promise.all([child.exited, new Response(child.stderr).text()])
    expect(error).toBe('')
    expect(status).toBe(0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
