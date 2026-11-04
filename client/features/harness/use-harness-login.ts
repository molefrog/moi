import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppConfig } from '@/client/api/app-config'
import {
  installHarness,
  startHarnessLogin,
  submitHarnessLoginCode,
  useHarnessStatus,
  type LoginHarness
} from './api'

export function useHarnessLogin(type: LoginHarness) {
  const { environment, demo } = useAppConfig()
  const auth = useHarnessStatus(type)
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [manualLogin, setManualLogin] = useState(false)
  const login = auth.data?.login
  const pending = login?.state === 'pending' ? login : undefined
  const starting = login?.state === 'starting'
  const waitingForBrowser = environment === 'local' && !manualLogin
  const availability = auth.data?.availability
  const action = useMutation({
    mutationFn: async (kind: 'install' | 'start' | 'submit') => {
      if (kind === 'install') {
        await installHarness(type)
        const refreshed = await auth.refetch({ throwOnError: true })
        if (refreshed.data?.availability.status === 'available') return
      }
      if (kind === 'start' || kind === 'install') {
        setManualLogin(false)
        setCode('')
        await startHarnessLogin(type)
      }
      if (kind === 'submit' && pending) {
        await submitHarnessLoginCode(type, pending.id, code)
        setCode('')
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['harness-status'] })
  })
  const needsInstall =
    environment === 'local' &&
    !demo &&
    availability?.status === 'unavailable' &&
    availability.code === 'not-installed'
  const checkError = auth.isError || availability?.status === 'unavailable'
  const failure = action.error?.message ?? (login?.state === 'failed' ? login.reason : undefined)
  // Keep the install button busy until the next screen's status has arrived.
  const installing =
    action.variables === 'install' &&
    (action.isPending ||
      (action.isSuccess &&
        !pending &&
        availability?.status !== 'available' &&
        !checkError &&
        !failure))
  const connected =
    !needsInstall && !installing && !starting && !pending && availability?.status === 'available'

  return {
    auth,
    needsInstall,
    installing,
    code,
    setCode,
    manualLogin,
    setManualLogin,
    pending,
    starting,
    waitingForBrowser,
    connected,
    action,
    checkError,
    failure
  }
}
