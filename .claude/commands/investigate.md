---
description: Do coding work through a task document with tests, proposals and verification
argument-hint: "<request> | continue <feedback> | report"
---

# Investigate

The request is: $ARGUMENTS

Read `AGENTS.md`, `docs/guidelines/coding.md`, `docs/guidelines/learning.md` and the relevant parts of `docs/kb/Index.md` first.

The task document is `docs/tasks/CURRENT.md`. Its structure is fixed (see `docs/tasks/TEMPLATE.md`):

- `# PROBLEM DESCRIPTION`: an exact copy of the request.
- `# UPDATES`: `## UPDATE` or `## REPORT` sections, each an exact copy of later feedback.
- `# TEST`: the tests that define the problem, and the success criteria.
- `# PROPOSALS`: a list `- No.X TITLE` (marked `[CONFIRMED]` or `[DENIED]` once tested), then a `## No.X TITLE` section per proposal with `### CODE CHANGE` and, once tested, `### CONFIRMED`, `### DENIED` or `### DENIED BY USER`.

## Step 1. Identify the request

- If `$ARGUMENTS` starts with `continue`: append the rest as a new `## UPDATE` at the end of `# UPDATES`. If the feedback rejects a `[CONFIRMED]` proposal, mark it `[DENIED]`, rename its section to `### DENIED BY USER` and explain why. Go to Step 5.
- If `$ARGUMENTS` starts with `report`: append any remaining text as `## REPORT`, then add a `# REPORT` section at the end that explains every `[CONFIRMED]` proposal, why it works, and how the confirmed proposals compare. Stop there.
- If `$ARGUMENTS` is empty: continue the task already in `docs/tasks/CURRENT.md` from where it stopped.
- Otherwise this is a new task:
  - If `docs/tasks/CURRENT.md` has content beyond the template, move it to `docs/tasks/archive/YYYY-MM-DD-hh-mm-ss.md` (current UTC time) first.
  - Copy `docs/tasks/TEMPLATE.md` to `docs/tasks/CURRENT.md` and paste the request verbatim under `# PROBLEM DESCRIPTION`.
  - If the request is split into `## Task N` sections, do them strictly one at a time, with a commit after each (see Git below).

## Step 2. Define the test

- Write under `# TEST` how the problem will be confirmed, and the success criteria. Passing tests is the minimum; add anything else that must hold, for example "leak-bench heap growth stays under the threshold", "`window.__vivi.unreleased` is 0", or the gate of the current roadmap level.
- Write the tests (Vitest for packages, Playwright for the playground) before any implementation. Prefer asserting through `window.__vivi` over screenshots.
- If the request says it cannot be reproduced with a test, write `N/A` and skip Steps 2 and 3.

## Step 3. Confirm the problem

- Run the new tests and confirm they fail for the expected reason. If they don't, fix the test and repeat.
- Retitle the section `# TEST [CONFIRMED]` and commit.

## Step 4. Propose solutions

- Read the related code and knowledge base pages, run the tests, read their output.
- Record every idea as `- No.X TITLE` in the list and a `## No.X TITLE` section with an empty `### CODE CHANGE`. Save the document before trying anything.

## Step 5. Confirm proposals one by one

- Pick the first proposal without a mark. If all are `[DENIED]`, go back to Step 4. If all are marked and at least one is `[CONFIRMED]`, keep the best one (explain why in its section if there are several) and go to Step 6.
- Write the planned change into `### CODE CHANGE` first, then implement it and run `pnpm verify` (and `pnpm build && pnpm e2e` when the playground or leak-bench is involved).
- Related tests failing means the proposal is denied. Unrelated tests failing means a regression: fix it and record the fix in the proposal.
- Check every success criterion under `# TEST`, not only the test results.
- Mark `[CONFIRMED]` or `[DENIED]` with a full explanation, commit the task document, then revert the code changes before trying the next proposal.

## Step 6. Verify and review

- Re-apply the chosen proposal, run `pnpm verify`, `pnpm build` and `pnpm e2e`.
- Review the diff against `docs/guidelines/coding.md` and `docs/guidelines/learning.md`. If the review changes code, run the checks again.
- If the change affects something described in `docs/kb/`, update that page.

## Git

- Commit after each `## Task N`, before starting the next one. Do not batch tasks into one commit, even when they are related.
- Without `## Task N` sections, one commit for the whole request is enough, plus the task-document commits from Steps 3 and 5.
- Push to the current branch when a push target exists. If the push is rejected because the remote moved, rebase onto it (never a merge commit) and rerun the tests if source files changed.

Do not ask questions; work the task to the end. The only exception is a request that contradicts itself in a way you cannot resolve.
