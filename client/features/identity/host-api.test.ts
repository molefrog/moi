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
      globalThis.window = { __MOI_CLOUD_BOOTSTRAP__: {
        identity: { id: 'user', type: 'user', name: 'Name', email: 'name@example.com', isAnonymous: false },
        workspace: { id: 'workspace', data: { members: [], invitations: [] } }
      } };
      const { installIdentityHostApi, consumeCloudBootstrap } = await import(${JSON.stringify(build.outputs[0]!.path)});
      installIdentityHostApi();
      consumeCloudBootstrap();
      const api = window.moi;
      if (window.__MOI_CLOUD_BOOTSTRAP__ || api.collab) throw new Error('Legacy API or bootstrap leaked');
      const version = api.identity.getRevision();
      consumeCloudBootstrap();
      if (api.identity.getRevision() !== version) throw new Error('Bootstrap consumed twice');
      api.identity.set({ id: 'user', type: 'user', name: 'Name', email: 'name@example.com', isAnonymous: false });
      api.workspaceMembers.set('workspace', { members: [], invitations: [] });
      if (api.identity.getRevision() < 1 || api.workspaceMembers.getRevision('workspace') < 1) throw new Error('Bridge did not initialize');
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
