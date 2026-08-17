import {
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState
} from 'react'

import {
  IconArrowUpRight,
  IconCheck,
  IconCopy,
  IconFolderOpen,
  IconFolders,
  IconMessage,
  IconMessageChatbot,
  IconMessages,
  IconX
} from '@tabler/icons-react'

import claudeIcon from '@/client/assets/claude.svg'
import floppyDisk from '@/client/assets/floppy-disk.png'
import hermesIcon from '@/client/assets/hermes.png'
import openaiIcon from '@/client/assets/openai.svg'
import openclawIcon from '@/client/assets/openclaw.svg'
import { Button, buttonVariants } from '@/client/components/ui/button'
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

type FloppyArtworkProps = {
  demoInstallUrl: string
}

const FLOPPY_POINTER_TRAVEL = 4

function FloppyArtwork({ demoInstallUrl }: FloppyArtworkProps) {
  const floppyRef = useRef<HTMLAnchorElement>(null)

  const moveFloppyOppositePointer = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!floppyRef.current) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width - 0.5
    const y = (event.clientY - bounds.top) / bounds.height - 0.5

    floppyRef.current.style.setProperty('--floppy-x', `${x * -2 * FLOPPY_POINTER_TRAVEL}px`)
    floppyRef.current.style.setProperty('--floppy-y', `${y * -2 * FLOPPY_POINTER_TRAVEL}px`)
  }

  const resetFloppyPosition = () => {
    floppyRef.current?.style.removeProperty('--floppy-x')
    floppyRef.current?.style.removeProperty('--floppy-y')
  }

  return (
    <div
      className="relative min-h-56 overflow-hidden md:min-h-full"
      onMouseMove={moveFloppyOppositePointer}
      onMouseLeave={resetFloppyPosition}
    >
      <a
        ref={floppyRef}
        href={demoInstallUrl}
        target="_blank"
        rel="noreferrer"
        className="group absolute top-1/2 left-1/2 w-44 -translate-x-1/2 -translate-y-1/2 rotate-4 [transform:translate3d(var(--floppy-x,0px),var(--floppy-y,0px),0)] rounded-lg transition-transform duration-150 ease-out will-change-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transform-none motion-reduce:transition-none md:w-40"
      >
        <img src={floppyDisk} alt="" className="w-full drop-shadow-xl" />
        <div
          className={buttonVariants({
            variant: 'outline',
            className: 'absolute -right-3 -bottom-2 -rotate-8'
          })}
        >
          About moi
          <IconArrowUpRight data-icon="inline-end" stroke={1.5} />
        </div>
      </a>
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
    <DialogContent
      data-vivid
      className="w-full max-w-md rounded-2xl bg-primary texture-checker-16 p-2 text-primary-foreground md:max-w-2xl"
    >
      <div className="absolute inset-0 bg-[image:linear-gradient(to_right,color-mix(in_oklch,var(--background)_14%,transparent),color-mix(in_oklch,var(--background)_6%,transparent))]" />
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
        <div className="rounded-xl bg-card p-6 text-card-foreground shadow-sm md:p-8">
          <div className="flex flex-col gap-0.5">
            <DialogTitle>Unlock all features</DialogTitle>
            <DialogDescription className="mt-1">
              This is a demo version with sample workspaces. Install moi locally and connect to your
              agent.
            </DialogDescription>
          </div>

          <ul className="mt-4 flex flex-col gap-3">
            <li className="flex items-center gap-3">
              <IconFolderOpen
                stroke={0.75}
                className="mt-0.5 size-8 shrink-0 text-muted-foreground"
              />
              <span className="text-sm text-foreground">
                Connect your own data sources and work on existing projects
              </span>
            </li>
            <li className="flex items-center gap-3">
              <IconMessageChatbot
                stroke={0.75}
                className="mt-0.5 size-8 shrink-0 text-muted-foreground"
              />
              <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-foreground">
                <span>Build with</span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <img src={claudeIcon} alt="" className="size-3.5 object-contain" />
                  Claude Code,
                </span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <img src={openaiIcon} alt="" className="size-3.5 object-contain" />
                  Codex,
                </span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <img src={hermesIcon} alt="" className="size-3.5 object-contain" />
                  Hermes,
                </span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <img src={openclawIcon} alt="" className="size-3.5 object-contain" />
                  OpenClaw,
                </span>
                <span>and more</span>
              </span>
            </li>
          </ul>

          <div className="mt-8 flex flex-col gap-3 pb-4">
            <p className="text-sm text-muted-foreground">Give this prompt to your agent</p>
            <div className="relative rounded-lg bg-muted p-4 pb-8">
              <code className="block font-mono text-sm leading-relaxed text-foreground">
                {AGENT_COMMAND}
              </code>
              <Button type="button" onClick={copy} className="absolute right-4 -bottom-4">
                {copied ? (
                  <IconCheck data-icon="inline-start" stroke={1.5} />
                ) : (
                  <IconCopy data-icon="inline-start" stroke={1.5} />
                )}
                {copied ? 'Copied' : 'Copy prompt'}
              </Button>
            </div>
          </div>
        </div>

        <FloppyArtwork demoInstallUrl={demoInstallUrl} />
      </div>

      <DialogClose
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label="Close"
            className="absolute top-4 right-4"
          >
            <IconX stroke={1.5} />
          </Button>
        }
      />
    </DialogContent>
  )
}
