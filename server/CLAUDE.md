Bun server on port 3000. Serves the client at `/`, upgrades `/ws` to WebSocket.

- `state.ts` holds global mutable state (messages, session, connected clients). `record()` appends, persists, and broadcasts.
- `agent.ts` sends prompts to Claude via `query()` from the agent SDK. Streams responses back as typed messages. Sessions are resumable.
- WebSocket protocol: server sends `ServerMessage`, client sends `ClientMessage` — both defined in `lib/types.ts`.
- Agent runs in `workspace/` with bypass permissions. Chat history persisted to `workspace/messages.json`.
