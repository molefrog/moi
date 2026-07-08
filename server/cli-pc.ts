// Our picocolors instance, with color-enablement we compute ourselves instead
// of trusting picocolors' auto-detection.
//
// picocolors decides `isColorSupported` once, at module-evaluation time, and
// enables color whenever `CI` is set — regardless of whether stdout is a TTY.
// That is wrong for us: `moi env` is captured through a pipe by agents and by
// CI test runners, which must see plain text. We also can't fix it by setting
// `NO_COLOR` first, because Bun evaluates picocolors early enough that the env
// mutation doesn't reach it (the `NO_COLOR` trick in `cli-colors.ts` only ever
// worked for citty, and locally only because the non-TTY path already disabled
// color when `CI` was absent).
//
// So we build colors explicitly: honor `NO_COLOR` / `FORCE_COLOR`, otherwise
// key off `isTTY` alone. Import this instead of `picocolors` anywhere the CLI
// colors its own output.
import { createColors } from 'picocolors'

const enabled = !process.env.NO_COLOR && (!!process.env.FORCE_COLOR || !!process.stdout.isTTY)

export default createColors(enabled)
