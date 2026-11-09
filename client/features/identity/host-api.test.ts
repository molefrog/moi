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
      if (api.identity.getRevision() < 1 || !api.workspaceMembers.getRevision()) throw new Error('Direct host calls must initialize before React');
      let revision = api.workspaceMembers.getRevision();
      for (const workspaceId of ['workspace', 'second']) {
        api.workspaceMembers.set(workspaceId, { members: [], invitations: [] });
        const next = api.workspaceMembers.getRevision();
        if (next <= revision) throw new Error('Changes to any workspace must advance the shared revision');
        revision = next;
      }
      api.workspaceMembers.setAll([]);
      if (api.workspaceMembers.getRevision() <= revision) throw new Error('An empty sharing collection must advance the revision');
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
