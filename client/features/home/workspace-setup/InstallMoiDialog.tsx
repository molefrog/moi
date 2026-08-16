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

type InstallMoiDialogProps = {
  // Trigger-owned (uncontrolled) or controlled via open/onOpenChange — the
  // create-workspace buttons use the former, programmatic opens the latter.
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

// Shown in the cloud demo wherever a workspace would be created: the demo is
// limited to its built-in workspaces, and the way out is installing moi.
export function InstallMoiDialog({ trigger, open, onOpenChange }: InstallMoiDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      <InstallMoiDialogContent />
    </Dialog>
  )
}

// Hero artwork: a floppy disk cropped by the band, on a soft gradient. The
// gradient's raw colors are a deliberate owner-approved exception to the
// semantic-token rule — this block is an illustration (constant across
// themes), not a UI surface.
function FloppyHero() {
  return (
    <div className="relative h-44 overflow-hidden rounded-lg bg-[#e6dcc4] bg-[image:radial-gradient(75%_110%_at_0%_0%,#e0742f_0%,rgba(224,116,47,0)_48%),radial-gradient(110%_160%_at_100%_0%,#16352a_0%,rgba(22,53,42,0)_60%),radial-gradient(70%_90%_at_90%_100%,#8fb492_0%,rgba(143,180,146,0)_55%),radial-gradient(60%_80%_at_8%_100%,#dcc294_0%,rgba(220,194,148,0)_52%)]">
      <FloppyDisk className="absolute top-9 left-1/2 w-52 -translate-x-1/2 -rotate-6 drop-shadow-xl" />
      {/* film grain, keeps the flat gradients from banding */}
      <svg
        className="absolute inset-0 size-full opacity-30 mix-blend-soft-light"
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
    </div>
  )
}

type FloppyDiskProps = {
  className?: string
}

// Front view of a 3.5" floppy: shutter with window, insert arrow, label
// area, write-protect holes. Drawn inline so it stays crisp and asset-free.
function FloppyDisk({ className }: FloppyDiskProps) {
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="floppy-shutter" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e3e3e1" />
          <stop offset="0.5" stopColor="#c8c8c6" />
          <stop offset="1" stopColor="#aeaeac" />
        </linearGradient>
      </defs>
      {/* body with clipped top-right corner */}
      <path
        d="M14 2h146l26 26v160a10 10 0 0 1-10 10H14A10 10 0 0 1 4 188V12A10 10 0 0 1 14 2Z"
        fill="#1a1b1d"
      />
      <path
        d="M14 2h146l26 26v160a10 10 0 0 1-10 10H14A10 10 0 0 1 4 188V12A10 10 0 0 1 14 2Z"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.08"
        strokeWidth="1.5"
      />
      {/* shutter */}
      <path d="M64 2h96v66a6 6 0 0 1-6 6H70a6 6 0 0 1-6-6V2Z" fill="url(#floppy-shutter)" />
      <rect x="116" y="12" width="28" height="52" rx="3" fill="#191a1c" />
      {/* insert arrow */}
      <path d="M26 30 34 16l8 14h-5v14h-6V30Z" fill="#0e0f10" />
      {/* label area */}
      <rect
        x="22"
        y="92"
        width="156"
        height="106"
        rx="8"
        fill="#202124"
        stroke="#ffffff"
        strokeOpacity="0.05"
      />
      {/* write-protect holes */}
      <rect x="14" y="168" width="13" height="13" rx="2" fill="#0c0d0e" />
      <rect x="172" y="168" width="13" height="13" rx="2" fill="#0c0d0e" />
      <rect x="175" y="171" width="7" height="7" rx="1" fill="#e6e6e4" />
    </svg>
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

function InstallMoiDialogContent() {
  const { demoInstallUrl } = useAppConfig()
  const { copied, copy } = useCopyCommand()

  return (
    <DialogContent className="w-[calc(100%-2rem)] max-w-md">
      <div className="p-2">
        <FloppyHero />
      </div>
      <DialogClose
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            className="absolute top-4 right-4 text-white hover:bg-white/20 hover:text-white"
          >
            <IconX stroke={1.75} />
          </Button>
        }
      />

      <div className="flex flex-col gap-5 p-6 pt-3">
        <div className="flex flex-col gap-0.5">
          <DialogTitle>Use moi with your projects</DialogTitle>
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
                {copied ? 'Copied' : 'Copy installation prompt'}
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
    </DialogContent>
  )
}
