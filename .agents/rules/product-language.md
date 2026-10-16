---
description: Product language and copy conventions for repo prose and the main app.
alwaysApply: true
---

- Write the product name as `Moi` in all prose and user-facing copy. Preserve lowercase only for technical identifiers and `moi` CLI.
- Use sentence case for headings, labels, actions, navigation, and messages.
- Prefer the product nouns workspace, chat, agent, model, widget, view, connector, session, and run.
- Use agent in UI copy for supported coding tools, such as “Connect an agent”.
- Display `claude-code` as **Claude** and `codex` as **ChatGPT** in user-facing labels and copy. Reuse `workspaceTypeLabel` in the client. Keep Anthropic and OpenAI as company subtitles.
- Keep Claude Code/Codex naming in internal harness identifiers, APIs, filenames, commands, and developer documentation. Preserve exact external setting names (for example, “Enable device code sign-in for Codex”), provider messages, and model names.
- Use harness for internal integration and authentication names, including types, functions, files, API routes, and events: `HarnessLoginState`, `startHarnessLogin`, `/api/harnesses/:type/auth`.
- Keep agent for actual agent identities, subagents, and provider-native terminology such as OpenClaw’s `agentId`; do not rename those to harness.
- Use chat for user-facing language and UI concepts.
- Use session for internal identifiers, state, persistence, protocols, and hooks that expose session state.
- Use thread only when matching terminology from an external provider or SDK.
- Apply the same boundary to code names and filenames. Session metadata uses names such as `sessionTitle`, `generateSessionTitle`, and `session-title.ts`. Use `chatTitle` and `chat-title.ts` only for client or UI label formatting.
- Translate provider-native thread terminology to session terminology at the adapter boundary. Keep thread naming only in native wire types, RPC methods, and provider-facing variables.
- Name actions precisely, such as `Remove workspace` or `Start new chat`.
- Avoid generic confirmations, hype, “please,” and “successfully.”
