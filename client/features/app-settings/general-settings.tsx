import { useLocation } from 'wouter'
import { Button } from '@/client/components/ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle
} from '@/ui-components/field'
import { useSaveAppSettings } from './api'
import { SettingsSection } from './settings-section'

export function GeneralSettings() {
  const save = useSaveAppSettings()
  const [, navigate] = useLocation()
  return (
    <SettingsSection title="General">
      <FieldGroup>
        <Field orientation="responsive">
          <FieldContent>
            <FieldTitle>Restart onboarding</FieldTitle>
            <FieldDescription>Go through the onboarding without logging out</FieldDescription>
          </FieldContent>
          <Button
            variant="secondary"
            aria-label="Restart onboarding"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({ showOnboarding: true }, { onSuccess: () => navigate('/onboarding') })
            }
          >
            {save.isPending ? 'Opening…' : 'Restart'}
          </Button>
        </Field>
      </FieldGroup>
      {save.isError && <p role="alert">Couldn’t restart onboarding. Try again</p>}
    </SettingsSection>
  )
}
