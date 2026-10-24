Fix the build: run `pnpm build:local`, diagnose and fix all type errors until it passes.

## Instructions

1. Run `pnpm build:local` (timeout 5 minutes)
2. If it passes, tell the user and stop.
3. If it fails, read the error output carefully:
   - Identify each type error (file, line, message)
   - Read the relevant source files
   - Fix the root cause — don't suppress errors with `any` or `@ts-ignore`
4. After fixing, run `pnpm build:local` again.
5. Repeat steps 3-4 until the build passes.
6. Summarize what you fixed.

## Rules

- Never use `@ts-ignore`, `@ts-expect-error`, or `as any` to suppress errors.
- Never run commands other than `pnpm build:local` and file reads/edits.
- Do not stage or commit changes — the user handles that.
- Keep output concise. Show the error, the fix, and the result.
