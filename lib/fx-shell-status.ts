// Sentences the fx adapter writes as a shell row's output when the command
// has none of its own (server/harness/fx/adapter.ts). The chat shows them in
// the row's summary line rather than as command output.
export const FX_HISTORY_PREVIEW_ONLY = 'fx did not include command output in this history preview.'
export const FX_NO_OUTPUT = 'Command produced no output.'

export const FX_STATUS_LINE =
  /^(?:fx did not include command output in this history preview\.|Command produced no output\.|Moved to the background(?: as \S+)?\.|\S+ finished with exit code -?\d+\.)$/
