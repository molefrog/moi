import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/client/components/ui/dialog'
import { Button } from '@/client/components/ui/button'
import { HarnessConnection, type LoginHarness } from './harness-connection'

type HarnessLoginDialogProps = {
  type: LoginHarness
}

export function HarnessLoginDialog({ type }: HarnessLoginDialogProps) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>Log in</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogTitle>Connect an agent</DialogTitle>
        <HarnessConnection type={type} installed />
      </DialogContent>
    </Dialog>
  )
}
