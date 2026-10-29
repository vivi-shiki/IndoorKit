# AGENTS.md

Project instructions shared by AI collaborators and human developers. Claude Code loads this file through `CLAUDE.md`; Codex reads `AGENTS.md` directly.

This repository is the IndoorKit SDK only. The demo app, the business packages (`domains/*`), the simulators, the venue generator and the memory regression tests live in [indoorkit-demo](https://github.com/vivi-shiki/indoorkit-demo), which includes this repository as a submodule ([ADR 0007](docs/adr/0007-sdk-and-demo-repositories.md)). Some older documents in `docs/` still refer to their former paths here.

## Layout

| Path | Responsibility |
| --- | --- |
| `packages/imdf` | Read IMDF, validate with zod, convert to `VenueModel`; extension files via `defineImdfExtension` |
| `packages/rtls` | Real-time positioning contract: `TagPosition`, `PositionBatch`, `DataProvider`, `positions:update` |
| `packages/core` | `createIndoorMap`, camera, plugin system, `ResourceTracker`, `EventBus`, style generation. The only package that imports maplibre-gl |
| `packages/plugins` | Official plugins (`floor`, `zone`, `position-stream`, `unit-cluster`, `unit-state`, `route`, `heatmap`, ...). No hospital, parking or museum concepts |

The SDK packages are framework-free TypeScript and know nothing about hospitals, parking or museums. The layers and what each may import are described in [ADR 0002](docs/adr/0002-sdk-and-domain-layers.md); `test/layers.test.ts` checks the SDK side here, and indoorkit-demo checks the rest.

## The only entry commands

```bash
pnpm verify   # lint + typecheck + unit tests
pnpm build    # build packages
```

Do not call vite, tsc or vitest directly. The one exception is narrowing a run while reproducing an intermittent failure, as described in [docs/guidelines/coding.md](docs/guidelines/coding.md#memory-leaks-and-intermittent-failures).

## Read before working

- Coding rules: [docs/guidelines/coding.md](docs/guidelines/coding.md). Read it before touching source code.
- Lessons learned from past tasks: [docs/guidelines/learning.md](docs/guidelines/learning.md). Read it before touching source code.
- Knowledge base: [docs/kb/Index.md](docs/kb/Index.md). Check it before making design or API decisions.
- Architecture decisions: [docs/adr](docs/adr).
- Roadmap: [docs/roadmap.en.md](docs/roadmap.en.md).

## Rules

- Write the test first, then the implementation. Commit only when `pnpm verify` passes. A change that affects how the map renders or behaves in the browser is also checked in indoorkit-demo (point its `sdk/` submodule at your branch, then `pnpm build && pnpm e2e` there) before it lands on `main`.
- Do not commit data about any real hospital, company or person.
- End every commit message with the trailer `Co-authored-by: vivi-shiki <70496895+vivi-shiki@users.noreply.github.com>`, after any other trailers, so the project owner is credited on GitHub.
- Browser-level checks use the `window.__vivi` test hooks of the indoorkit-demo app; prefer them over screenshots.

## Workflows

Claude Code uses slash commands in `.claude/commands/`. Codex uses the matching repository skills in `.codex/skills/` (`$investigate` and `$refine`). The two sets follow the same task document and verification process:

- `/investigate <request>` or `$investigate <request>`: the default for coding work (features, bug fixes, refactoring). It keeps a task document at `docs/tasks/CURRENT.md` with the success criteria, numbered proposals and their outcomes. `investigate continue <feedback>` appends feedback to the current task; `investigate report` summarizes the confirmed proposals.
- `/refine` or `$refine`: turns archived task documents in `docs/tasks/archive/` into rules in `docs/guidelines/learning.md`. Document-only; never edits source code.

Work through the request to the end without asking questions, unless the request contradicts itself in a way you cannot resolve. Stop and ask before anything that cannot be undone: publishing to npm, deleting data, or force-pushing.
