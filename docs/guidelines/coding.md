# Coding rules

## Architecture constraints

1. Every source, layer, map listener and event subscription a plugin creates must be registered through `ctx.trackSource`, `ctx.trackLayer`, `ctx.onMap`, `ctx.on` or `ctx.track`. Plugins must not call `map.on` without registering it.
2. After `destroy()`, `resources.size` must be 0. The memory lab and leak-bench check this.
3. Plugins communicate only through `ctx.get(name)` (declared in `deps`) and the `EventBus`. No global variables.
4. Layer and source ids always start with `indoor-`.
5. Styles are generated from data categories plus a theme. Colors never go into the data.
6. Map text is provided in at least `ja` and `en`.
7. Core logic must be testable without WebGL, using `FakeMap`.
8. Keep the four layers apart ([ADR 0002](../adr/0002-sdk-and-domain-layers.md), checked by `test/layers.test.ts`): only `@indoorkit/core` imports maplibre-gl; SDK packages contain no hospital concepts; `domains/hospital` imports no map, SDK runtime or DOM; pages use SDK public APIs only (no raw map, no `indoor-` layer ids, no plugin casts). Code that connects the domain to SDK plugins goes in `apps/playground/src/adapters`.

## Fail loudly, but validate input

IndoorKit is an SDK other people will call, so the rule depends on where the problem comes from.

- **Internal invariants** (a plugin dependency must be loaded, a level id produced by the SDK must exist, `resources.size` is 0 after `destroy()`): when one is violated, throw. Do not skip silently, log a warning and carry on, or add "just in case" null checks for values that cannot be missing. A crash shows the bug; a fallback hides it. Fix the cause instead of tolerating the impossible state.
- **External input** (IMDF data, options and arguments passed by callers): validate explicitly, with zod where a schema fits, and fail with an error that names the bad field. These are expected failures, so they belong in the function's signature or documented behavior.
- Never swallow an exception. Catch only where recovery is real.

## Memory leaks and intermittent failures

- Memory leaks and intermittent test failures are always the highest priority.
- An intermittent failure is not an "environment issue" until proven otherwise. Treat a fix as confirmed only after the affected test passes 10 times in a row, for example `pnpm exec playwright test <file> --repeat-each=10` or `pnpm exec vitest run <file>` in a loop. Raise the count for failures that showed up rarely.
- Reproduce on the smallest scope first (one test file, one test), and use that same scope to confirm the fix before running the full suite.
- If you run into an existing leak or intermittent failure while working on something else, fix it as part of the task, in a separate commit.

## Design

- Don't repeat information: a rule (an id prefix, a level id format, a style mapping) lives in exactly one place. This is about information, not code. A few lines of plain object construction do not need a helper.
- Be conservative with new abstractions. Extract when the same logic appears three or more times, or when it gives clear ownership. Do not write helpers that are called only once.
- Fix the root cause. If an API in this repo does not fit, change the API instead of working around it at the call site. Breaking changes are fine until the packages are published to npm (roadmap level 6); after that, record them with Changesets.
- Avoid polling. Use events or async scheduling.
