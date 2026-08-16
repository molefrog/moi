import { type ReactElement, useEffect, useState } from 'react'

import {
  IconArrowUpRight,
  IconCheck,
  IconCopy,
  IconFolders,
  IconLock,
  IconTerminal2,
  IconX
} from '@tabler/icons-react'

import { HomeLogo } from '../HomeLogo'
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
  'Set up the MOI workspace for this project. Fetch https://moi.computer/INSTALL.md, and follow the steps.'

const FEATURES = [
  {
    icon: IconFolders,
    text: 'Create workspaces for your own projects and folders'
  },
  {
    icon: IconTerminal2,
    text: 'Use your own agent and subscription — Claude Code, Codex, or OpenClaw'
  },
  {
    icon: IconLock,
    text: 'Everything runs and stays on your computer'
  }
] as const

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
  const config = useAppConfig()
  const { copied, copy } = useCopyCommand()
  const installUrl = config.data?.demoInstallUrl ?? 'https://moi.computer'

  return (
    <DialogContent className="w-[calc(100%-2rem)] max-w-md">
      <div className="flex h-28 items-center justify-center bg-muted">
        <HomeLogo className="text-muted-foreground" />
      </div>
      <DialogClose
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            className="absolute top-4 right-4"
          >
            <IconX stroke={1.75} />
          </Button>
        }
      />

      <div className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-0.5">
          <DialogTitle>Get moi on your computer</DialogTitle>
          <DialogDescription>
            This cloud demo is limited to its built-in workspaces. The full moi runs locally with
            your own agent.
          </DialogDescription>
        </div>

        <ul className="flex flex-col gap-3">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon size={16} stroke={1.75} />
              </span>
              <span className="text-sm text-foreground">{text}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">To install, paste this to your agent:</p>
          <div className="relative rounded-lg bg-muted p-3 pr-11">
            <code className="block font-mono text-xs leading-relaxed text-foreground">
              {AGENT_COMMAND}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={copy}
              aria-label={copied ? 'Copied' : 'Copy command'}
              className="absolute top-1.5 right-1.5"
            >
              {copied ? <IconCheck stroke={1.75} /> : <IconCopy stroke={1.75} />}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            render={<a href={installUrl} target="_blank" rel="noreferrer" />}
          >
            moi.computer
            <IconArrowUpRight data-icon="inline-end" stroke={1.5} />
          </Button>
          <Button type="button" onClick={copy}>
            {copied ? (
              <IconCheck data-icon="inline-start" stroke={1.5} />
            ) : (
              <IconCopy data-icon="inline-start" stroke={1.5} />
            )}
            {copied ? 'Copied' : 'Copy command'}
          </Button>
        </div>
      </div>
    </DialogContent>
  )
}
