import { type ReactElement, useEffect, useState } from 'react'

import {
  IconArrowUpRight,
  IconCheck,
  IconCopy,
  IconFolders,
  IconTerminal2,
  IconX
} from '@tabler/icons-react'

import claudeIcon from '@/client/assets/claude.svg'
import floppyDisk from '@/client/assets/floppy-disk.png'
import hermesIcon from '@/client/assets/hermes.png'
import openaiIcon from '@/client/assets/openai.svg'
import openclawIcon from '@/client/assets/openclaw.svg'
import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from '@/client/components/ui/dialog'
import { useAppConfig } from '@/client/api/app-config'

// The canonical setup prompt from moi.computer — pasted into any agent, it
// fetches INSTALL.md and walks itself through the install.
const AGENT_COMMAND =
  'Set up the moi workspace for this project. Fetch https://moi.computer/INSTALL.md, and follow the steps.'

type CloudDemoPromoDialogProps = {
  // Trigger-owned (uncontrolled) or controlled via open/onOpenChange — the
  // create-workspace buttons use the former, programmatic opens the latter.
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

// Shown in the cloud demo wherever a workspace would be created: the demo is
// limited to its built-in workspaces, and the way out is installing moi.
export function CloudDemoPromoDialog({ trigger, open, onOpenChange }: CloudDemoPromoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      <CloudDemoPromoDialogContent />
    </Dialog>
  )
}

function FloppyArtwork() {
  return (
    <div className="relative min-h-56 overflow-hidden md:min-h-full">
      <img
        src={floppyDisk}
        alt=""
        className="absolute top-1/2 left-1/2 w-44 -translate-x-1/2 -translate-y-1/2 -rotate-6 drop-shadow-xl md:w-40"
      />
    </div>
  )
}

function useCopyCommand() {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const copy = () => {
    navigator.clipboard
      ?.writeText(AGENT_COMMAND)
      .then(() => setCopied(true))
      .catch(() => {})
  }

  return { copied, copy }
}

function CloudDemoPromoDialogContent() {
  const { demoInstallUrl } = useAppConfig()
  const { copied, copy } = useCopyCommand()

  return (
    // The fixed raw colors belong to the illustration and stay consistent across themes.
    <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl bg-[#e6dcc4] bg-[image:radial-gradient(75%_110%_at_0%_0%,#e0742f_0%,rgba(224,116,47,0)_48%),radial-gradient(110%_160%_at_100%_0%,#16352a_0%,rgba(22,53,42,0)_60%),radial-gradient(70%_90%_at_90%_100%,#8fb492_0%,rgba(143,180,146,0)_55%),radial-gradient(60%_80%_at_8%_100%,#dcc294_0%,rgba(220,194,148,0)_52%)] p-2 md:max-w-2xl">
      {/* Film grain keeps the illustration gradient from banding. */}
      <svg
        className="pointer-events-none absolute inset-0 size-full opacity-30 mix-blend-soft-light"
        aria-hidden="true"
      >
        <filter id="floppy-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="2"
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#floppy-grain)" />
      </svg>

      <div className="relative grid max-h-[calc(100dvh-2rem)] overflow-y-auto md:grid-cols-[3fr_2fr] md:overflow-visible">
        <div className="flex flex-col gap-5 rounded-xl bg-card p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-0.5">
            <DialogTitle className="pr-8 md:pr-0">Use moi with your projects</DialogTitle>
            <DialogDescription>
              This demo comes with sample workspaces. Connect moi to your agent to unlock all
              features.
            </DialogDescription>
          </div>

          <ul className="flex flex-col gap-3">
            <li className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <IconFolders size={20} stroke={1.5} />
              </span>
              <span className="text-sm text-foreground">
                Connect your own data and import existing projects
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <IconTerminal2 size={20} stroke={1.5} />
              </span>
              <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-foreground">
                <span>Works with</span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <img src={claudeIcon} alt="" className="size-4 object-contain" />
                  Claude Code,
                </span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <img src={openaiIcon} alt="" className="size-4 object-contain" />
                  Codex,
                </span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <img src={hermesIcon} alt="" className="size-4 object-contain" />
                  Hermes,
                </span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <img src={openclawIcon} alt="" className="size-4 object-contain" />
                  OpenClaw,
                </span>
                <span>and more.</span>
              </span>
            </li>
          </ul>

          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Paste this prompt into your agent:</p>
            <div className="rounded-lg bg-muted p-3">
              <code className="block font-mono text-sm leading-relaxed text-foreground">
                {AGENT_COMMAND}
              </code>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Button type="button" onClick={copy}>
                  {copied ? (
                    <IconCheck data-icon="inline-start" stroke={1.5} />
                  ) : (
                    <IconCopy data-icon="inline-start" stroke={1.5} />
                  )}
                  {copied ? 'Copied' : 'Copy prompt'}
                </Button>
                <Button
                  variant="secondary"
                  nativeButton={false}
                  render={<a href={demoInstallUrl} target="_blank" rel="noreferrer" />}
                >
                  Learn more
                  <IconArrowUpRight data-icon="inline-end" stroke={1.5} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <FloppyArtwork />
      </div>

      <DialogClose
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label="Close"
            className="absolute top-5 right-5"
          >
            <IconX stroke={1.5} />
          </Button>
        }
      />
    </DialogContent>
  )
}
