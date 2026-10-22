import { useId, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Field, FieldGroup, FieldLabel } from '@/ui-components/field'
import { Input } from '@/client/components/ui/input'
import { toast } from '@/client/components/ui/toast'
import { useAccount } from '../account/account-provider'
import { SettingsSection } from './settings-section'

export function AccountSettings() {
  const account = useAccount()
  if (!account.profile) return null
  return (
    <SettingsSection title="Account">
      <FieldGroup>
        <NameField
          key={account.profile.id}
          name={account.profile.name ?? ''}
          readOnly={!account.canEdit}
          onSave={account.saveName}
        />
        {account.email && (
          <Field>
            <FieldLabel htmlFor="account-email">Email</FieldLabel>
            <Input id="account-email" value={account.email} readOnly type="email" />
          </Field>
        )}
      </FieldGroup>
    </SettingsSection>
  )
}

type NameFieldProps = {
  name: string
  readOnly?: boolean
  onSave: (name: string) => Promise<string>
}

export function NameField({ name, readOnly, onSave }: NameFieldProps) {
  const id = useId()
  const [draft, setDraft] = useState<string>()
  const save = useMutation({
    mutationFn: onSave,
    onSuccess: () => setDraft(undefined),
    onError: error =>
      toast.add({ title: 'Couldn’t save name', description: error.message, type: 'error' })
  })
  const pending = save.isPending
  const skipBlur = useRef(false)

  function commit() {
    if (readOnly || pending) return
    const next = (draft ?? name).trim()
    if (!next || next.length > 80 || next === name) {
      setDraft(undefined)
      return
    }
    setDraft(next)
    save.mutate(next)
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>Name</FieldLabel>
      <Input
        id={id}
        value={draft ?? name}
        autoComplete="name"
        maxLength={80}
        readOnly={readOnly}
        disabled={pending}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => {
          if (skipBlur.current) {
            skipBlur.current = false
            return
          }
          void commit()
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            skipBlur.current = true
            setDraft(undefined)
            event.currentTarget.blur()
          }
        }}
      />
    </Field>
  )
}
