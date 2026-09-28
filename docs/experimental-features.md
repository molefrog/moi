# Experimental features

Experimental features are startup flags. Add a boolean key with a `false` default to
[`lib/experimental.ts`](../lib/experimental.ts), then use that key in the feature's server and
client code. For example, adding `newFeature: false` registers:

- `moi start --experimental-new-feature`
- `experimental.newFeature` in `GET /api/config` and `useAppConfig()`

The CLI builds its `start` flags from the registered keys. Unknown experimental flags fail with an
error. Use camelCase keys; the CLI name uses kebab case. A server started without the flag keeps
the feature off.
The launcher forwards enabled flags to the server and preserves them across dev and update restarts.
Experimental features cannot be enabled through `config.json` or environment variables.

Only `moi start` gets these runtime flags automatically. If a feature needs workspace setup, add
that action to `moi init` separately. Collaboration uses `moi init --experimental-collab` to install
its optional guide and types.
