---
name: refine
description: Turn the earliest archived task document into general rules in docs/guidelines/learning.md. Use when asked to refine lessons from finished tasks.
---

# Refine

Extract lessons from finished tasks and write them to `docs/guidelines/learning.md`. This is document-only work: do not modify source code.

## Step 1. Pick the earliest archive

- List `docs/tasks/archive/`. File names are UTC timestamps.
- If several of the earliest files are snapshots of the same task, keep the latest (most complete) one and delete the others. Stop at the first file that belongs to a different task.
- Take the earliest remaining file.

## Step 2. Extract findings

Read the whole file. Focus on what reveals the maintainer's preferences:

- `# PROBLEM DESCRIPTION`: ignore plain feature requests. For refactoring requests, note the reason and the expected improvement.
- `# UPDATES`: corrections to earlier proposals. These matter most.
- `[DENIED BY USER]` proposals and their explanations.

Keep findings that generalize: coding rules, design principles, library usage (MapLibre, IMDF, zod, Playwright), and knowledge useful for maintaining this repo. Skip one-off facts about a single feature.

## Step 3. Write learnings

- Give each finding a short title that carries the key idea and enough scope to be unambiguous (name the module or API, e.g. "`ResourceTracker.disposeAll` ...", not "dispose order").
- If it matches an existing entry, increase that entry's counter. Merge the new detail into its content; if the maintainer changed their mind, replace the content but keep the counter.
- Otherwise add `- TITLE [1]` to `# Orders` and a `## TITLE` section under `# Refinements`.
- Keep `# Orders` sorted by counter, highest first.
- Rules that are hard constraints the maintainer stated outright belong in `docs/guidelines/coding.md` instead; mention them in your summary rather than moving them yourself.

## Step 4. Clean up

Delete the processed archive file. Process only one archive per run.
