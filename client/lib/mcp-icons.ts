// Icons for known MCP servers. Logos under `client/assets/mcp/` are pulled
// from logo.dev (free pk_ token) — drop a new `<server>.png` into the folder
// and add an import + map entry below. Google product icons (Gmail/Drive/
// Calendar) come from the official gstatic product art since logo.dev only
// resolves company domains, not per-product brands.
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
import chromeDevtoolsIcon from '@/client/assets/mcp/chrome-devtools.png'
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
  'chrome-devtools': chromeDevtoolsIcon,
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
  postgres: 'postgresql',
  'hugging face': 'huggingface',
  jira: 'atlassian',
  confluence: 'atlassian'
}

// Strip the `claude.ai ` host prefix that Claude-hosted MCPs carry, leaving the
// bare service name (`claude.ai Google Drive` → `Google Drive`). Other names
// pass through unchanged.
function stripHostPrefix(server: string): string {
  return server.replace(/^claude\.ai\s+/i, '')
}

export function getMcpIcon(server: string): string | undefined {
  const name = stripHostPrefix(server).toLowerCase().trim()
  const key = ALIASES[name] ?? name
  return ICONS[key]
}

// Title-case the server name for display: `notion` → `Notion`, `granola` → `Granola`.
// Names with hyphens or underscores stay readable: `my-server` → `My-Server`.
// The Claude-hosted prefix is dropped first so `claude.ai Figma` shows as `Figma`.
export function formatMcpServerName(server: string): string {
  return stripHostPrefix(server)
    .split(/([_-])/)
    .map(part => (part.length > 1 ? part[0].toUpperCase() + part.slice(1) : part))
    .join('')
}
