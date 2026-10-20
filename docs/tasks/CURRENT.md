# !!!INVESTIGATE!!!

# PROBLEM DESCRIPTION

先写测试，而后修复这些问题

验收标准：
1、这些修复现在正常推送到主分支
2、测试通过

("这些问题" are the issues summarized in the previous task (docs/tasks/archive, phone layout): four intermittent e2e failures, of which three were already fixed and pushed (clusterScreenPoint, tagScreenPoint, contrast-test timeout); still open are the MapLibre `feature index out of bounds` race in `queryRenderedFeatures`, and CRLF working copies on Windows that make `pnpm verify` fail.)

# UPDATES

# TEST [CONFIRMED]

1. `packages/plugins/test/overlays.test.ts` "floor overlay updates" (Vitest, FakeMap): while a source update is still loading, further `setData` calls are held and only the latest is sent once the source has loaded; a `sourcedata` event for another source does not release it; with nothing loading, updates go out at once. `FakeMap` gains a loading model for this (`holdSourceLoads`, `finishSourceLoad`, `isSourceLoaded`, `sourceUpdates`). Before the fix: 3 updates sent instead of 1.
2. `apps/playground/e2e/streaming-query.spec.ts` (Playwright): on the assets and tracking pages, query the live layers every frame for 15 s while data streams and floors switch every 100 ms; no query may throw. Before the fix the assets page throws `feature index out of bounds` in 2 of 5 runs. Success: 20/20 runs pass.
3. `test/repo.test.ts` (Vitest, root `test/` added to `vitest.config.ts`): every tracked text file has `eol=lf` in its git attributes, and none is checked out with CRLF. Before the fix: 19 files checked out CRLF here, no file declares `eol=lf`.
4. `pnpm verify`, `pnpm build`, `pnpm e2e` pass; the fixes are on `origin/main`.

# PROPOSALS

- No.1 `.gitattributes` declares LF for every text file [CONFIRMED]
- No.2 `floorOverlay` sends `setData` only after the previous update has loaded
- No.3 `floorOverlay` also holds floor filter changes while an update is loading

## No.1 `.gitattributes` declares LF for every text file

### CODE CHANGE

Add `.gitattributes` with `* text=auto eol=lf`. `git add --renormalize .` changes nothing (the index was already LF). The 19 CRLF working copies were checked to differ only in line endings (`git diff --ignore-cr-at-eol`) and checked out again.

### CONFIRMED

`test/repo.test.ts` passes: 0 CRLF working copies, every text file has `text=auto eol=lf`, and the 5 binary files stay `-text`. `pnpm verify` lint and typecheck pass on the full repo without any manual line-ending conversion. Only the overlay test from No.2 still fails, as expected.
