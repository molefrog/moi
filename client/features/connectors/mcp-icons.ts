// Icons for known MCP servers. Logos under `client/assets/mcp/` are pulled
// from logo.dev (free pk_ token) — drop a new `<server>.png` into the folder
// and add an import + map entry below. Google product icons (Gmail/Drive/
// Calendar) come from the official gstatic product art since logo.dev only
// resolves company domains, not per-product brands. A few are SVG (e.g.
// `chrome.svg`) — Bun resolves both `.png` and `.svg` imports to a URL string.
//
// Server name lookup is case-insensitive so `Notion`, `notion`, and `NOTION`
// all resolve. Claude-hosted MCPs arrive prefixed (`claude.ai Google Drive`) —
// that prefix is stripped before lookup so the underlying service resolves.
// Unknown servers fall back to a generic tabler icon — see
// `client/components/TurnView.tsx`.
import agentationIcon from '@/client/assets/mcp/agentation.png'
import airtableIcon from '@/client/assets/mcp/airtable.png'
import apolloIcon from '@/client/assets/mcp/apollo.png'
import asanaIcon from '@/client/assets/mcp/asana.png'
import atlassianIcon from '@/client/assets/mcp/atlassian.png'
import boxIcon from '@/client/assets/mcp/box.png'
import chromeIcon from '@/client/assets/mcp/chrome.svg'
import clickupIcon from '@/client/assets/mcp/clickup.png'
import cloudflareIcon from '@/client/assets/mcp/cloudflare.png'
import context7Icon from '@/client/assets/mcp/context7.png'
import datadogIcon from '@/client/assets/mcp/datadog.png'
import discordIcon from '@/client/assets/mcp/discord.png'
import dropboxIcon from '@/client/assets/mcp/dropbox.png'
import elevenlabsIcon from '@/client/assets/mcp/elevenlabs.png'
import exaIcon from '@/client/assets/mcp/exa.png'
import figmaIcon from '@/client/assets/mcp/figma.png'
import firecrawlIcon from '@/client/assets/mcp/firecrawl.png'
import githubIcon from '@/client/assets/mcp/github.png'
import gitlabIcon from '@/client/assets/mcp/gitlab.png'
import gmailIcon from '@/client/assets/mcp/gmail.png'
import googlecalendarIcon from '@/client/assets/mcp/googlecalendar.png'
import googledriveIcon from '@/client/assets/mcp/googledrive.png'
import grafanaIcon from '@/client/assets/mcp/grafana.png'
import granolaIcon from '@/client/assets/mcp/granola.png'
import hubspotIcon from '@/client/assets/mcp/hubspot.png'
import huggingfaceIcon from '@/client/assets/mcp/huggingface.png'
import intercomIcon from '@/client/assets/mcp/intercom.png'
import linearIcon from '@/client/assets/mcp/linear.png'
import mondayIcon from '@/client/assets/mcp/monday.png'
import mongodbIcon from '@/client/assets/mcp/mongodb.png'
import neonIcon from '@/client/assets/mcp/neon.png'
import notionIcon from '@/client/assets/mcp/notion.png'
import paperIcon from '@/client/assets/mcp/paper.png'
import paypalIcon from '@/client/assets/mcp/paypal.png'
import perplexityIcon from '@/client/assets/mcp/perplexity.png'
import postgresqlIcon from '@/client/assets/mcp/postgresql.png'
import posthogIcon from '@/client/assets/mcp/posthog.png'
import puppeteerIcon from '@/client/assets/mcp/puppeteer.png'
import railwayIcon from '@/client/assets/mcp/railway.png'
import redisIcon from '@/client/assets/mcp/redis.png'
import salesforceIcon from '@/client/assets/mcp/salesforce.png'
import sentryIcon from '@/client/assets/mcp/sentry.png'
import shopifyIcon from '@/client/assets/mcp/shopify.png'
import slackIcon from '@/client/assets/mcp/slack.png'
import snowflakeIcon from '@/client/assets/mcp/snowflake.png'
import stripeIcon from '@/client/assets/mcp/stripe.png'
import supabaseIcon from '@/client/assets/mcp/supabase.png'
import telegramIcon from '@/client/assets/mcp/telegram.png'
import twilioIcon from '@/client/assets/mcp/twilio.png'
import vercelIcon from '@/client/assets/mcp/vercel.png'
import zapierIcon from '@/client/assets/mcp/zapier.png'

const ICONS: Record<string, string> = {
  agentation: agentationIcon,
  airtable: airtableIcon,
  apollo: apolloIcon,
  asana: asanaIcon,
  atlassian: atlassianIcon,
  box: boxIcon,
  chrome: chromeIcon,
  'chrome-devtools': chromeIcon,
  clickup: clickupIcon,
  cloudflare: cloudflareIcon,
  context7: context7Icon,
  datadog: datadogIcon,
  discord: discordIcon,
  dropbox: dropboxIcon,
  elevenlabs: elevenlabsIcon,
  exa: exaIcon,
  figma: figmaIcon,
  firecrawl: firecrawlIcon,
  github: githubIcon,
  gitlab: gitlabIcon,
  gmail: gmailIcon,
  googlecalendar: googlecalendarIcon,
  googledrive: googledriveIcon,
  grafana: grafanaIcon,
  granola: granolaIcon,
  hubspot: hubspotIcon,
  huggingface: huggingfaceIcon,
  intercom: intercomIcon,
  linear: linearIcon,
  monday: mondayIcon,
  mongodb: mongodbIcon,
  neon: neonIcon,
  notion: notionIcon,
  paper: paperIcon,
  paypal: paypalIcon,
  perplexity: perplexityIcon,
  postgresql: postgresqlIcon,
  posthog: posthogIcon,
  puppeteer: puppeteerIcon,
  railway: railwayIcon,
  redis: redisIcon,
  salesforce: salesforceIcon,
  sentry: sentryIcon,
  shopify: shopifyIcon,
  slack: slackIcon,
  snowflake: snowflakeIcon,
  stripe: stripeIcon,
  supabase: supabaseIcon,
  telegram: telegramIcon,
  twilio: twilioIcon,
  vercel: vercelIcon,
  zapier: zapierIcon
}

// Display/server names that don't equal their icon key. Keyed by the lowercased
// service name (after the `claude.ai ` prefix is stripped).
const ALIASES: Record<string, string> = {
  'google drive': 'googledrive',
  'google calendar': 'googlecalendar',
  gcal: 'googlecalendar',
  gdrive: 'googledrive',
  'apollo.io': 'apollo',
  'paper-desktop': 'paper',
  'granola-mcp': 'granola',
  'claude-in-chrome': 'chrome',
  postgres: 'postgresql',
  'hugging face': 'huggingface',
  jira: 'atlassian',
  confluence: 'atlassian'
}

// Strip the `claude.ai` host prefix that Claude-hosted MCPs carry, leaving the
// bare service name so the icon/label resolve to the real provider. Two forms:
//   - spaced  `claude.ai Google Drive`        (adapter display name)
//   - encoded `claude_ai_Google_Drive`        (Claude Code tool name, where the
//     server is `mcp__claude_ai_<Server>__<tool>` and underscores stand in for
//     spaces/dots in the service name)
// For the encoded form, turn the separator underscores back into spaces so the
// bare name matches `ICONS`/`ALIASES` (`Google_Drive` → `Google Drive`). Unknown
// services (e.g. `claude_ai_Airbed` → `Airbed`) still unwrap and fall back to a
// generic icon. Names without the prefix pass through unchanged.
function stripHostPrefix(server: string): string {
  const m = server.match(/^claude[._]ai[._\s]+(.+)$/i)
  if (!m) return server
  return m[1].replace(/_/g, ' ')
}

// Collapse a server name to a comparison key: lowercase, drop every separator so
// the registry name and the tool-name encoding of the same server compare equal
// (`claude-in-chrome`, `Claude_in_Chrome`, `claude.in.chrome` → `claudeinchrome`).
// The same server is encoded inconsistently across surfaces (the header reads it
// from `mcpServerStatus()`, a tool call embeds it in `mcp__<server>__<tool>`), so
// matching on the raw string misses; canonicalizing makes both resolve to the
// same icon.
function canon(name: string): string {
  return name.toLowerCase().replace(/[\s._-]+/g, '')
}

// Canonicalized lookups, built once from the readable maps above. Alias values
// are icon keys, so canonicalize both sides.
const ICONS_BY_CANON = new Map(Object.entries(ICONS).map(([k, v]) => [canon(k), v]))
const ALIASES_BY_CANON = new Map(Object.entries(ALIASES).map(([k, v]) => [canon(k), canon(v)]))

export function getMcpIcon(server: string): string | undefined {
  const key = canon(stripHostPrefix(server))
  return ICONS_BY_CANON.get(ALIASES_BY_CANON.get(key) ?? key)
}

// Title-case the server name for display: `notion` → `Notion`, `granola` →
// `Granola`. Separators (`-`, `_`, `.`, spaces) all become a single space so the
// variants of one server read the same (`claude-in-chrome` and `Claude_in_Chrome`
// → `Claude In Chrome`). The Claude-hosted prefix is dropped first so
// `claude.ai Figma` / `claude_ai_Figma` show as `Figma`.
export function formatMcpServerName(server: string): string {
  return stripHostPrefix(server)
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}
