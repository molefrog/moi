// Personal / dev feature flags — flip these in code, not in the UI.
//
// These are compile-time constants (inlined into the client bundle), not
// per-thread or per-workspace settings. Change one and rebuild the client.

// Live token-by-token streaming of assistant responses. When true, the client
// asks the server to stream partial messages (only honored by providers whose
// `/models` payload reports `supportsStreaming` — Claude Code and OpenClaw;
// ignored elsewhere). When false, responses arrive as whole blocks, exactly as
// before streaming existed.
export const STREAM_RESPONSES = true
