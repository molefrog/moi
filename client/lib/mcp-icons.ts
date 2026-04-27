// Icons for known MCP servers. Logos under `client/assets/mcp/` are pulled
// from logo.dev (free pk_ token) — drop a new `<server>.png` into the folder
// and add an import + map entry below.
//
// Server name lookup is case-insensitive so `Notion`, `notion`, and `NOTION`
// all resolve. Unknown servers fall back to a generic tabler icon — see
// `client/components/TurnView.tsx`.
import atlassianIcon from '@/client/assets/mcp/atlassian.png'
import discordIcon from '@/client/assets/mcp/discord.png'
import figmaIcon from '@/client/assets/mcp/figma.png'
import githubIcon from '@/client/assets/mcp/github.png'
import gitlabIcon from '@/client/assets/mcp/gitlab.png'
import granolaIcon from '@/client/assets/mcp/granola.png'
import hubspotIcon from '@/client/assets/mcp/hubspot.png'
import linearIcon from '@/client/assets/mcp/linear.png'
import neonIcon from '@/client/assets/mcp/neon.png'
import notionIcon from '@/client/assets/mcp/notion.png'
import sentryIcon from '@/client/assets/mcp/sentry.png'
import slackIcon from '@/client/assets/mcp/slack.png'
import stripeIcon from '@/client/assets/mcp/stripe.png'
import supabaseIcon from '@/client/assets/mcp/supabase.png'
import vercelIcon from '@/client/assets/mcp/vercel.png'

const ICONS: Record<string, string> = {
  atlassian: atlassianIcon,
  discord: discordIcon,
  figma: figmaIcon,
  github: githubIcon,
  gitlab: gitlabIcon,
  granola: granolaIcon,
  hubspot: hubspotIcon,
  linear: linearIcon,
  neon: neonIcon,
  notion: notionIcon,
  sentry: sentryIcon,
  slack: slackIcon,
  stripe: stripeIcon,
  supabase: supabaseIcon,
  vercel: vercelIcon
}

export function getMcpIcon(server: string): string | undefined {
  return ICONS[server.toLowerCase()]
}

// Title-case the server name for display: `notion` → `Notion`, `granola` → `Granola`.
// Names with hyphens or underscores stay readable: `my-server` → `My-Server`.
export function formatMcpServerName(server: string): string {
  return server
    .split(/([_-])/)
    .map(part => (part.length > 1 ? part[0].toUpperCase() + part.slice(1) : part))
    .join('')
}
