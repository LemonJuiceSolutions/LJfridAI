# src/actions vs src/app/actions

Historical split. Both dirs contain Next.js Server Actions (`'use server'`).

**Convention going forward:**

- **`src/app/actions/`** — new Server Actions belong here. Co-located with the App Router tree.
- **`src/actions/`** — legacy; do not add new files. Existing files re-exported via the barrel [src/app/actions.ts](../app/actions.ts).

When touching a file in `src/actions/`, if the change is non-trivial, consider moving it to `src/app/actions/` in a separate commit and updating all import sites.

Consumers must import from the barrel `@/app/actions` or from the specific file. Never reach across `src/actions/` and `src/app/actions/` with duplicate function names.
