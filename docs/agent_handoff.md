# Aestus — Agent Handoff Protocol

Rules for any coding agent (automated or human-assisted) picking up a task from `docs/specs/cockpit_agentic_build_todo.md`. Following this protocol is mandatory. Deviations must be justified in `progress.md`.

---

## Before starting a task

1. **Check for `.stop`** — if a file named `.stop` exists at the repo root, stop immediately. Do not start or continue any task. Report the last completed task ID and exit.

2. **Run `git status`** — if the working tree is dirty (modified tracked files or untracked files related to in-progress work), identify which task they belong to (look at the first unchecked task in the current phase). Either complete the partial work properly or `git restore` it and redo from scratch. Never commit half-understood leftovers.

3. **Read `progress.md`** — search for entries relevant to the files and services you will touch. Prior decisions and assumptions in `progress.md` are binding. A task that would contradict an existing progress entry must be flagged `[!]` before proceeding.

4. **Read `git log --oneline -15`** for the files you will touch — recent commits may contain decisions not yet in `progress.md`.

5. **Read the task's "Agent action" and "Done when"** in full. Implement exactly that — nothing more.

---

## Doing the work

- **One task at a time, in order within the phase.** Do not skip tasks or reorder unless a task is blocked (`[!]`).
- **No scope expansion.** If a task seems to require work outside its "Agent action", stop. Mark `[!]`, explain why in `progress.md`, commit, and stop.
- **No automated order placement** of any kind, ever. See `docs/non_goals.md`.
- **The LLM never invents price levels.** If you are implementing a briefing or level feature, all numeric levels must come from deterministic code only.
- **Fixture-first.** Any new service or component must be functional with local fixtures before live providers are connected.
- **When a task changes a contract** (shared schema, event type, API shape, database column): update the schema definition, fixtures, API docs, and frontend types in the same commit.

---

## After completing a task

1. **Verify every "Done when" criterion** — run the specified typecheck, tests, or scripts. If a criterion cannot be verified, explain why in `progress.md` and mark it as an assumption.

2. **Flip the checkbox** `[ ]` → `[x]` in `docs/specs/cockpit_agentic_build_todo.md` for the completed task.

3. **Append a `progress.md` entry** in the following format:

   ```
   ### <TASK-ID> — <short title>
   - Files: <paths changed or created>
   - Checks: <typecheck/tests/scripts run + result; "none required" if none>
   - Assumptions: <anything decided that the spec left open; "none" if none>
   - Follow-ups: <new task IDs suggested or created; "none" if none>
   ```

4. **Commit** using a conventional commit message that references the task ID. Include the updated todo file and `progress.md` in the same commit as the task deliverables.

   Commit message format:
   ```
   <type>(P00-T001): <short description>

   <optional body>
   ```

   Common types: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`.

---

## When a task is blocked

If a task cannot be completed or requires a human decision:

1. Mark the task `[!]` in the todo (replace `[ ]` with `[!]`).
2. Append a `progress.md` entry explaining the blocker clearly.
3. Commit the `[!]` state and progress entry.
4. Stop the phase and report the blocker to the human.

Do not attempt workarounds that cross non-goal boundaries or require scope expansion.

---

## Task status legend

| Symbol | Meaning |
|--------|---------|
| `[ ]` | Not started |
| `[~]` | In progress (set this before starting if you expect a long task) |
| `[x]` | Done |
| `[!]` | Blocked — needs human decision |

---

## Commit conventions

- Use `feat` for new capabilities, `docs` for documentation, `chore` for scaffolding/config, `fix` for bug corrections, `test` for test additions.
- Branch names follow `task/PXX-TXXX-short-description` (e.g., `task/P03-T004-clickhouse-schema`).
- One logical deliverable per commit. Never combine two tasks in one commit.

---

## What not to do

- Do not add features, refactoring, or abstractions beyond what the task requires.
- Do not add error handling or validation for scenarios that cannot happen.
- Do not skip `[ ]` → `[x]` updates or `progress.md` entries — they are the persistent state for the next agent.
- Do not edit `metrics.csv` (runner-owned file).
- Do not push to remote unless explicitly instructed.
