#!/usr/bin/env node
// Local HTTPS mirror for esm.sh — for browser-testing moi in sandboxed cloud
// environments (Claude Code on the web and similar).
//
// Why this exists: the client loads React from https://esm.sh via an import
// map (client/index.html). Cloud sandboxes force outbound HTTPS through a
// TLS-intercepting egress relay, and that relay closes BoringSSL-style TLS
// ClientHellos — Chromium and Bun both fail against it (ERR_CONNECTION_CLOSED
// mid-handshake), while OpenSSL clients (curl, Node) pass. So the browser can
// never fetch esm.sh directly, no matter which proxy/cert flags it gets.
//
// The fix: run this mirror on 127.0.0.1:443 and start the browser with
//   --no-proxy-server --host-resolver-rules="MAP esm.sh 127.0.0.1"
// plus self-signed-cert tolerance (--ignore-certificate-errors, Playwright's
// ignoreHTTPSErrors, or agent-browser's AGENT_BROWSER_IGNORE_HTTPS_ERRORS).
// The page's https://esm.sh/* requests then land here; upstream fetches go
// out through HTTPS_PROXY (Node reads it via NODE_USE_ENV_PROXY) and get
// cached on disk. See docs/browser-testing-cloud.md for the full workflow.
//
// Node, not Bun, deliberately: Bun's fetch (BoringSSL) cannot complete a TLS
// handshake through the egress relay — the whole reason this mirror exists.
process.env.NODE_USE_ENV_PROXY ??= '1'

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const flag = name => {
  const i = args.indexOf(`--${name}`)
  return i !== -1 ? args[i + 1] : undefined
}
const PORT = Number(flag('port') ?? 443)
// Only mirror these upstreams (the Host header picks the upstream, so an
// unrestricted mirror would be an open localhost proxy).
const HOSTS = new Set((flag('hosts') ?? 'esm.sh').split(','))

const stateDir = join(tmpdir(), 'moi-esm-mirror')
const cacheDir = join(stateDir, 'cache')
mkdirSync(cacheDir, { recursive: true })

// Self-signed cert, minted once per state dir. Browsers are told to ignore
// cert errors anyway; the SAN just keeps Chromium's interstitial quieter.
const keyFile = join(stateDir, 'key.pem')
const certFile = join(stateDir, 'cert.pem')
if (!existsSync(certFile)) {
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyFile,
      '-out',
      certFile,
      '-days',
      '365',
      '-subj',
      '/CN=moi-esm-mirror',
      '-addext',
      `subjectAltName=DNS:${[...HOSTS].join(',DNS:')}`
    ],
    { stdio: 'ignore' }
  )
}

const server = createServer(
  { key: readFileSync(keyFile), cert: readFileSync(certFile) },
  async (req, res) => {
    const host = (req.headers.host ?? '').replace(/:\d+$/, '')
    if (!HOSTS.has(host)) {
      res.writeHead(403).end(`host not mirrored: ${host}`)
      return
    }
    const upstream = `https://${host}${req.url}`
    const id = createHash('sha256').update(upstream).digest('hex').slice(0, 24)
    const bodyFile = join(cacheDir, id)
    const metaFile = `${bodyFile}.json`
    try {
      let body, meta
      if (existsSync(metaFile)) {
        meta = JSON.parse(readFileSync(metaFile, 'utf8'))
        body = readFileSync(bodyFile)
        console.log(`hit  ${upstream}`)
      } else {
        const r = await fetch(upstream, { redirect: 'follow' })
        body = Buffer.from(await r.arrayBuffer())
        meta = { status: r.status, ct: r.headers.get('content-type') ?? 'application/octet-stream' }
        if (r.status === 200) {
          writeFileSync(bodyFile, body)
          writeFileSync(metaFile, JSON.stringify(meta))
        }
        console.log(`miss ${r.status} ${upstream}`)
      }
      res.writeHead(meta.status, {
        'content-type': meta.ct,
        // Import-map module fetches from the app origin are CORS requests.
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=3600'
      })
      res.end(body)
    } catch (err) {
      console.log(`err  ${upstream} — ${err.message}`)
      res.writeHead(502, { 'access-control-allow-origin': '*' })
      res.end(String(err))
    }
  }
)

server.listen(PORT, '127.0.0.1', () => {
  console.log(
    `esm mirror on https://127.0.0.1:${PORT} for ${[...HOSTS].join(', ')} (cache: ${cacheDir})`
  )
})
