# Quiz Loop (working name)

A live classroom quiz for Thai secondary teachers. Every wrong option maps to a misconception, so a game ends with **จุดที่ควรทบทวน** and a **รอบทบทวน** of 3 teacher-approved questions played in the same class period.

**Status:** TEST. Discovery is running, and the build is gated. This is a portfolio project in a personal AI Product Studio. It has no users, pilots, or results yet.

## Start here

- `CLAUDE.md` has the rules for Claude Code.
- `docs/00-decision-review.md` covers the decision, gates, and evidence.
- `docs/01-product-brief.md` covers the product, MVP, and AI spec.
- `docs/03-ux-spec-v1.md` is the locked UX.
- `docs/05-build-plan.md` lists the phases and pass criteria.
- `prompts/` holds the Claude Code prompts for each phase.

## Setup

Requires [Bun](https://bun.sh) 1.3+, Node.js 22+ (for `next`), Git, and Docker if you want a local Supabase stack.

```bash
bun install
cp .env.example .env.local   # fill in Supabase values from P2 on; never commit .env.local
bun run dev                  # http://localhost:3000
```

Checks:

```bash
bun run typecheck
bun run lint
bun run test        # Vitest unit tests
bun run test:e2e    # Playwright + axe; first time: bunx playwright install chromium
```

Local database (P2+):

```bash
bun run db:start    # Supabase CLI (bundled as a devDependency) + Docker
bun run db:reset    # apply supabase/migrations/
bun run db:types    # regenerate src/types/database.ts
```

Full command list and conventions: `CLAUDE.md` → Commands.
