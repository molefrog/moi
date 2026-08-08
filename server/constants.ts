export const PORT = Number(process.env.PORT) || 13337
// M=13, E=5, I=9 -> 13059. Env-overridable (like PORT) so a second instance —
// e.g. a standalone build under test — can run beside the dev server.
export const CONTROL_PORT = Number(process.env.MOI_CONTROL_PORT) || 13059
