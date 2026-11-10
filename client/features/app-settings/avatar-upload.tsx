import { useRef, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { IconCamera, IconLoader } from '@tabler/icons-react'
import { Button } from '@/client/components/ui/button'
import { cn } from '@/client/lib/cn'
import { toast } from '@/client/components/ui/toast'
import { useAccount } from '../account/account-provider'

type AvatarUploadProps = { children: ReactNode }

export function AvatarUpload({ children }: AvatarUploadProps) {
  const account = useAccount()
  const input = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: (file: File) => account.saveAvatar(file),
    onSuccess: () => toast.add({ title: 'Avatar updated', type: 'success' }),
    onError: error =>
      toast.add({ title: 'Couldn’t update avatar', description: error.message, type: 'error' })
  })

  return (
    <div className="flex items-start">
      <input
        ref={input}
        type="file"
        accept="image/*"
        aria-label="Choose an avatar file"
        className="hidden"
        disabled={upload.isPending}
        onChange={event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) upload.mutate(file)
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        className="group/avatar relative size-16 overflow-hidden rounded-full p-0"
        aria-label="Change your avatar"
        aria-busy={upload.isPending}
        disabled={upload.isPending || !account.registered}
        onClick={() => input.current?.click()}
      >
        {children}
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-background/70 opacity-0 transition-opacity group-hover/avatar:opacity-100 group-focus-visible/avatar:opacity-100',
            upload.isPending && 'opacity-100'
          )}
        >
          {upload.isPending ? (
            <IconLoader size={20} className="animate-spin" stroke={1.5} />
          ) : (
            <IconCamera size={20} stroke={1.5} />
          )}
        </span>
      </Button>
    </div>
  )
}
