import { IconFileSearch } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'

type UnavailablePageProps = {
  onOpenOverview: () => void
}

export function UnavailablePage({ onOpenOverview }: UnavailablePageProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex flex-col items-center justify-center gap-2">
        <IconFileSearch size={56} stroke={0.5} aria-hidden />
        <p className="text-sm">There's no such page in this workspace</p>
      </div>
      <Button variant="secondary" onClick={onOpenOverview}>
        Back to overview
      </Button>
    </div>
  )
}
