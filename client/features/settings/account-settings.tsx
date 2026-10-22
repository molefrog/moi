import { useId, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from '@/ui-components/field'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
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
  const [validationError, setValidationError] = useState<string>()
  const save = useMutation({
    mutationFn: onSave,
    onSuccess: () => setDraft(undefined)
  })
  const pending = save.isPending
  const error = validationError ?? save.error?.message
  const skipBlur = useRef(false)

  function commit() {
    if (readOnly || pending) return
    const next = (draft ?? name).trim()
    if (!next || next.length > 80) {
      setValidationError('Enter a name of up to 80 characters.')
      return
    }
    if (next === name) {
      setDraft(undefined)
      setValidationError(undefined)
      save.reset()
      return
    }
    setValidationError(undefined)
    setDraft(next)
    save.mutate(next)
  }

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>Name</FieldLabel>
      <Input
        id={id}
        value={draft ?? name}
        autoComplete="name"
        maxLength={80}
        readOnly={readOnly}
        disabled={pending}
        aria-invalid={!!error}
        aria-describedby={error || readOnly || pending ? `${id}-status` : undefined}
        onChange={event => {
          setDraft(event.target.value)
          setValidationError(undefined)
          save.reset()
        }}
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
            setValidationError(undefined)
            save.reset()
            event.currentTarget.blur()
          }
        }}
      />
      {(error || readOnly || pending) && (
        <div id={`${id}-status`}>
          {error ? (
            <div className="flex flex-col items-start gap-2">
              <FieldError>{error}</FieldError>
              <Button variant="outline" size="sm" onClick={() => void commit()}>
                Try again
              </Button>
            </div>
          ) : (
            <FieldDescription role="status">
              {readOnly ? 'Managed by your sign-in provider.' : pending ? 'Saving…' : null}
            </FieldDescription>
          )}
        </div>
      )}
    </Field>
  )
}
