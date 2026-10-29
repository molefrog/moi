# Testing

- Name tests `*.test.ts` or `*.test.tsx`, without extra `.dom` or `.render` suffixes.
- Add a test when you can name a plausible regression worth catching. Check existing coverage first and extend it where useful. Copy, styling, and straightforward re-export changes usually need only existing checks and visual review where relevant.
- Assert observable results. Avoid freezing CSS classes, decorative markup, entire paragraphs, or configuration catalogs. Exact values are useful when they define a required contract, such as accessible names, wire formats, or generated CSS scoping.
- Choose expected results independently of the implementation. Copying its logic, calling the same helper to calculate the expectation, or checking a mock's own setup can leave a broken feature passing.
- Test UI actions through rendered controls. Invoking component props directly bypasses event wiring and disabled behavior. Static HTML cannot prove layout or that state survives a mounted transition.
- Keep overlapping coverage when it catches a distinct failure or checks a different integration boundary. Similar cases across harness adapters, persistence, or recovery paths can each be necessary. Remove duplication that adds no such protection.
- Keep the behavior under test real; mock external boundaries where needed. For a bug fix, verify that the regression test fails without the fix when practical. Avoid elaborate fixtures or new test infrastructure for a small change.

Run `bun run check:repo` for file naming and local Markdown link checks. CI runs it alongside lint, typecheck, and tests. After a rename or deletion, also search for the old path and filename to catch references in comments and code spans.

Linux CI and release tests use `MOI_SECRET_BACKEND=file` with normal `bun test`. A `Bun.secrets` probe loads system GLib/GObject libraries even when the keychain is unavailable; subsequent Sharp image processing can segfault. Use the existing file backend on headless runners to avoid that native-library interaction:

```sh
MOI_SECRET_BACKEND=file bun test
```
