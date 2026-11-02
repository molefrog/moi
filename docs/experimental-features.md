# Experimental features

This is the recipe for restoring Moi's previous `ExperimentalFeatures` system when a new experiment needs it. The runtime code was removed after collaboration became a standard cloud feature. Collaboration is now temporarily disabled through app config in [server/app-config.ts](../server/app-config.ts); keep that setting separate from future experiments.

## Behavior to preserve

- Every feature defaults to `false` and is enabled explicitly with `moi start --experimental-<name>`.
- Flags apply to the whole server process and all its workspaces. They are fixed at startup and require a restart to change.
- `config.json`, environment variables, user settings, and `.moi/.workspace.json` cannot enable an experiment. Dev mode does not enable experiments either.
- The server enforces feature availability. Hiding UI alone is insufficient.
- The browser receives the resolved flags through `GET /api/config`, so it uses the same values as the server.
- Starting with a flag does not install workspace files or change saved settings. If a feature needs an optional guide or types, give installation its own command.

## Shared registry

Recreate `lib/experimental.ts` with the new feature in place of this example:

```ts
export const EXPERIMENTAL_DEFAULTS = {
  exampleFeature: false
} satisfies Record<string, false>

export type ExperimentalFeatures = {
  [Key in keyof typeof EXPERIMENTAL_DEFAULTS]: boolean
}
export type ExperimentalFeature = keyof ExperimentalFeatures

export const EXPERIMENTAL_FEATURES = Object.keys(EXPERIMENTAL_DEFAULTS) as ExperimentalFeature[]

export function experimentalFlagName(feature: string): string {
  return `experimental-${feature.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`
}
```

This produces `--experimental-example-feature`. Adding another default registers another flag with the same behavior.

## Resolve the flags at startup

In [server/app-config.ts](../server/app-config.ts):

1. Add `experimental: ExperimentalFeatures` to `AppConfig` and a copy of `EXPERIMENTAL_DEFAULTS` to its defaults.
2. Use `Omit<AppConfig, 'experimental'>` for the deployment fields read from files and environment variables. Keep the existing explicit parsers; do not merge arbitrary file keys into the config.
3. Give `loadAppConfig` a third argument, `cliExperimental: Partial<ExperimentalFeatures> = {}`. Resolve the flags separately:

   ```ts
   const experimental = Object.freeze({
     ...EXPERIMENTAL_DEFAULTS,
     ...cliExperimental
   })
   ```

   Include this in the frozen result after resolving deployment settings.

4. Let `initializeAppConfig(experimental: Partial<ExperimentalFeatures> = {})` pass the CLI values to the resolver before the web server is imported. `getAppConfig()` without CLI initialization keeps all experiments off.
5. Forward a copy of the resolved flags from `clientAppConfig()`.

Add the matching `experimental: ExperimentalFeatures` field to `ClientAppConfig` in [lib/types.ts](../lib/types.ts). Import and re-export the shared type there if callers need it. In [client/api/app-config.ts](../client/api/app-config.ts), add the shared defaults to the initial browser config. Keep the existing startup fetch and failed-refresh behavior.

## CLI and child processes

In [server/cli/commands/start.ts](../server/cli/commands/start.ts), generate boolean arguments from the registry:

```ts
const experimentalArgs = Object.fromEntries(
  EXPERIMENTAL_FEATURES.map(feature => {
    const name = experimentalFlagName(feature)
    const label = name.slice('experimental-'.length).replaceAll('-', ' ')
    return [name, { type: 'boolean' as const, description: `Enable experimental ${label}` }]
  })
)
```

Spread those into the command's `args`. In `run`, collect only explicitly enabled flags:

```ts
const experimental: Partial<ExperimentalFeatures> = {}
const experimentalFlags: string[] = []
for (const feature of EXPERIMENTAL_FEATURES) {
  const flag = experimentalFlagName(feature)
  if (args[flag] !== true) continue
  experimental[feature] = true
  experimentalFlags.push(`--${flag}`)
}
```

Reject unknown `--experimental-*` names from `rawArgs` before launching anything, so typos produce an error. The old implementation compared names against `new Set(EXPERIMENTAL_FEATURES.map(experimentalFlagName))`.

The launcher and actual server are different processes. Update [server/cli/server.ts](../server/cli/server.ts) to accept an `experimentalFlags: string[] = []` argument in `spawnServer`, appending it after `start` in the child command. Pass the same array through:

- The initial server launch
- The dev supervisor's initial launch and every restart
- The update supervisor's replacement server

In the actual server process (`MOI_SERVER=1`), call `initializeAppConfig(experimental)` before importing the web server. Merely setting the parent process's cached config does not configure its child. Launches through other entry points, including services, stay at the defaults unless they explicitly supply flags.

## Feature gates

Have server code read `getAppConfig().experimental.exampleFeature` through one feature-specific helper. Apply the gate before handling its endpoints, opening sockets, starting workers, or creating data. Keep authentication and authorization checks in place independently of the feature flag.

Have the UI read `useAppConfig().experimental.exampleFeature` when mounting the feature's provider or controls. This also prevents background activity for a disabled feature. Keep feature code out of app startup side effects when disabled.

## Checks before shipping

Extend [server/app-config.test.ts](../server/app-config.test.ts) and [client/api/app-config.test.ts](../client/api/app-config.test.ts), and add focused CLI and feature tests. Cover:

- Plain and dev starts keep the feature disabled, even with old file or environment settings present.
- The explicit flag enables it and appears in CLI help; unknown experimental flags fail before launch.
- Production and dev child processes receive the flag, including restart paths.
- Server and browser config agree, and both the config and nested flags are frozen on the server.
- Disabled features reject requests and create no workers, database files, or workspace configuration.
- Enabled features work through their real entry points.

[server/test/cli-collab.test.ts](../server/test/cli-collab.test.ts) has a server-launch capture fixture that can be reused for CLI coverage. Its current tests verify deployment environment forwarding and optional guide installation.

Run `bun run check:repo`, typecheck, and the relevant tests. Update [config.md](config.md) and the new feature's docs with its flag and restart requirements.
