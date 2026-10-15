import {
  IconCircleNumber1,
  IconCircleNumber2,
  IconCircleNumber3,
  IconChevronRight,
  IconCopy
} from '@tabler/icons-react'

import { Button, buttonVariants } from '@/client/components/ui/button'
import { toast } from '@/client/components/ui/toast'

type DeviceLoginStepsProps = {
  code: string
  url?: string
}

export function DeviceLoginSteps({ code, url }: DeviceLoginStepsProps) {
  return (
    <ol className="mx-auto grid w-full max-w-72 grid-cols-1 gap-6 text-left text-sm @3xl:max-w-4xl @3xl:grid-cols-3">
      <li className="flex max-w-72 min-w-0 flex-col items-start gap-3 @3xl:min-w-60">
        <IconCircleNumber1 size={24} stroke={1.5} className="shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col items-start gap-3">
          <p>Enable device code sign-in for Codex in ChatGPT settings</p>
          <a
            href="https://chatgpt.com/settings/security"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-wrap items-center gap-1 font-semibold focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Settings
            <IconChevronRight size={16} stroke={1.75} aria-hidden="true" />
            Security and login
          </a>
        </div>
      </li>
      <li className="flex max-w-72 min-w-0 flex-col items-start gap-3 @3xl:min-w-60">
        <IconCircleNumber2 size={24} stroke={1.5} className="shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col items-start gap-3">
          <p>Copy the one-time device code below</p>
          <div className="flex items-center gap-4 rounded-lg bg-accent py-1 pr-1 pl-3">
            <code className="text-lg">{code}</code>
            <Button
              variant="ghost"
              aria-label="Copy code"
              size="icon-sm"
              onClick={() => {
                navigator.clipboard.writeText(code).then(
                  () => toast.add({ title: 'Code copied', type: 'success' }),
                  () => toast.add({ title: 'Could not copy code', type: 'error' })
                )
              }}
            >
              <IconCopy stroke={1.75} />
            </Button>
          </div>
        </div>
      </li>
      <li className="flex max-w-72 min-w-0 flex-col items-start gap-3 @3xl:min-w-60">
        <IconCircleNumber3 size={24} stroke={1.5} className="shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col items-start gap-3">
          <p>Sign-in in browser, paste the code, and then come back to moi</p>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'secondary' })}
            >
              Open browser
            </a>
          )}
        </div>
      </li>
    </ol>
  )
}
