---
description: Product language and copy conventions for repo prose and the main app.
alwaysApply: true
---

- Write the product name as `moi` in all prose and user-facing copy. Preserve existing casing only for technical identifiers.
- Use sentence case for headings, labels, actions, navigation, and messages.
- Prefer the product nouns workspace, chat, agent, model, widget, view, connector, session, and run.
- Use chat for user-facing language and UI concepts.
- Use session for internal identifiers, state, persistence, protocols, and hooks that expose session state.
- Use thread only when matching terminology from an external provider or SDK.
- Apply the same boundary to code names and filenames. Session metadata uses names such as `sessionTitle`, `generateSessionTitle`, and `session-title.ts`. Use `chatTitle` and `chat-title.ts` only for client or UI label formatting.
- Translate provider-native thread terminology to session terminology at the adapter boundary. Keep thread naming only in native wire types, RPC methods, and provider-facing variables.
- Name actions precisely, such as `Remove workspace` or `Start new chat`.
- Avoid generic confirmations, hype, “please,” and “successfully.”
