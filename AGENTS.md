# AGENTS.md

Project instructions shared by AI collaborators and human developers. Claude Code loads this file through `CLAUDE.md`; Codex reads `AGENTS.md` directly.

## Layout

| Path | Responsibility |
| --- | --- |
| `packages/imdf` | Read IMDF, validate with zod, convert to `VenueModel`; extension files via `defineImdfExtension` |
| `packages/rtls` | Real-time positioning contract: `TagPosition`, `PositionBatch`, `DataProvider`, `positions:update` |
| `packages/core` | `createIndoorMap`, camera, plugin system, `ResourceTracker`, `EventBus`, style generation. The only package that imports maplibre-gl |
| `packages/plugins` | Official plugins (`floor`, `zone`, `position-stream`, `unit-cluster`, `heatmap`, ...). No hospital concepts |
| `domains/hospital` | Hospital business logic without a map or DOM: departments, roster model, alarm rules and engine |
| `tools/venue-gen` | Generates IMDF data for the fictional hospital "さくら総合病院" |
| `tools/rtls-simulator` | Roster and movement simulator, as a Worker data provider |
| `tools/leak-bench` | Playwright memory regression tests |
| `apps/playground` | Demo gallery, deployed to GitHub Pages: `engine/`, `adapters/`, `presentation/`, `pages/<page>/{index,view}.ts`, `testing/` |

The layers and what each may import are described in [ADR 0002](docs/adr/0002-sdk-and-domain-layers.md) and checked by `test/layers.test.ts`.

## The only entry commands

```bash
pnpm verify   # lint + typecheck + unit tests
pnpm build    # generate data + build packages + build playground
pnpm e2e      # end-to-end and memory regression tests (run pnpm build first)
```

Do not call vite, tsc, vitest or playwright directly. The one exception is narrowing a run while reproducing an intermittent failure, as described in [docs/guidelines/coding.md](docs/guidelines/coding.md#memory-leaks-and-intermittent-failures).

## Read before working

- Coding rules: [docs/guidelines/coding.md](docs/guidelines/coding.md). Read it before touching source code.
- Lessons learned from past tasks: [docs/guidelines/learning.md](docs/guidelines/learning.md). Read it before touching source code.
- Knowledge base: [docs/kb/Index.md](docs/kb/Index.md). Check it before making design or API decisions.
- Architecture decisions: [docs/adr](docs/adr).
- Roadmap: [docs/roadmap.en.md](docs/roadmap.en.md).

## Rules

- Write the test first, then the implementation. Commit only when `pnpm verify` and `pnpm e2e` both pass.
- Do not commit data about any real hospital, company or person.
- Prefer checking state through the `window.__vivi` test hooks (`apps/playground/src/testing/hooks.ts`) over screenshots. Use screenshots only when the rendering itself is what is being checked.

## Workflows

Claude Code uses slash commands in `.claude/commands/`. Codex uses the matching repository skills in `.codex/skills/` (`$investigate` and `$refine`). The two sets follow the same task document and verification process:

- `/investigate <request>` or `$investigate <request>`: the default for coding work (features, bug fixes, refactoring). It keeps a task document at `docs/tasks/CURRENT.md` with the success criteria, numbered proposals and their outcomes. `investigate continue <feedback>` appends feedback to the current task; `investigate report` summarizes the confirmed proposals.
- `/refine` or `$refine`: turns archived task documents in `docs/tasks/archive/` into rules in `docs/guidelines/learning.md`. Document-only; never edits source code.

Work through the request to the end without asking questions, unless the request contradicts itself in a way you cannot resolve. Stop and ask before anything that cannot be undone: publishing to npm, deleting data, or force-pushing.
