# ADR 0007: Separate SDK and demo repositories

Status: accepted

IndoorKit started as one pnpm workspace holding the SDK, the business packages, the simulators, the venue generator and the demo app. On 2026-10-30 it is split into two repositories:

- [IndoorKit](https://github.com/vivi-shiki/IndoorKit) keeps the tool library: `packages/imdf`, `packages/rtls`, `packages/core` (including the generic `@indoorkit/core/twin` Three.js renderer) and `packages/plugins`, with their unit tests and the architecture test that keeps the SDK free of business words and UI frameworks.
- [indoorkit-demo](https://github.com/vivi-shiki/indoorkit-demo) keeps everything built on the SDK: `apps/playground`, `domains/*`, `tools/venue-gen` (venues and committed campus models), the three simulators, `tools/leak-bench`, the end-to-end tests and the GitHub Pages deployment at <https://vivi-shiki.github.io/indoorkit-demo/>.

The old address <https://vivi-shiki.github.io/IndoorKit/> stays alive: IndoorKit's CI deploys `pages/`, whose `index.html` and `404.html` send visitors to the same path, query and hash route under the new address, so shared links such as `?lang=ja#/parking/twin` keep working.

Both repositories keep the full history of the single repository up to the split.

Until the SDK is published to npm, the demo includes IndoorKit as a git submodule at `sdk/` that follows `main`, and its pnpm workspace lists `sdk/packages/*`. The `workspace:*` dependencies, TypeScript sources as package entry points and the layer rules therefore work as before, and the demo always builds against an exact SDK commit. `pnpm sdk:update` moves the submodule to the latest `main`; the change is committed like any other. A git dependency with a subdirectory was rejected because the SDK packages depend on each other through `workspace:*`, which only resolves inside a workspace. After the first npm release the submodule is replaced by version ranges.

The layer rules from [ADR 0002](0002-sdk-and-domain-layers.md) still hold. The SDK repository checks that `packages/*` imports no business code, contains no hospital, parking or museum words and uses no UI framework. The demo repository checks the business layer, the pages and the scenario boundaries, and reads the SDK sources from `sdk/packages` for the checks that the SDK does not know the scenarios.
