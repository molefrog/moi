import { useRef, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { IconLoader } from '@tabler/icons-react'
import { Button } from '@/client/components/ui/button'
import { toast } from '@/client/components/ui/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { useAccount } from '../account/account-provider'

type CloudAvatarUploadProps = { children: ReactNode }

export function CloudAvatarUpload({ children }: CloudAvatarUploadProps) {
  const account = useAccount()
  const input = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: (file: File) => account.saveAvatar(file),
    onSuccess: () => toast.add({ title: 'Avatar updated', type: 'success' }),
    onError: error =>
      toast.add({ title: 'Couldn’t update avatar', description: error.message, type: 'error' })
  })

  return (
    <>
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
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label="Change your avatar"
              aria-busy={upload.isPending}
              disabled={upload.isPending || !account.registered}
              onClick={() => input.current?.click()}
            />
          }
        >
          {upload.isPending ? <IconLoader className="animate-spin" stroke={1.5} /> : children}
        </TooltipTrigger>
        <TooltipContent>
          {upload.isPending ? 'Updating avatar…' : 'Change your avatar'}
        </TooltipContent>
      </Tooltip>
    </>
  )
}
