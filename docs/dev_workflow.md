# Developer Workflow

Reference for branch naming, commit style, and the agent task loop. Applies to both
human contributors and agentic build workers.

## Branch naming

Format: `task/<PHASE-TASKID>-<short-slug>`

Examples:

```
task/P03-T004-clickhouse-schema
task/P14-T002-api-auth-middleware
task/P17-T005-cockpit-briefing-card
```

Rules:

- Use the exact task ID from the backlog (`docs/specs/cockpit_agentic_build_todo.md`).
- Slug is lowercase kebab-case, max 5 words.
- One branch per task. Merge to `main` when the task's done-when criteria are met.

## Commit style (Conventional Commits)

```
<type>(<scope>): <short imperative description>

[optional body]
[optional footer]
```

### Types

| Type       | When to use                                             |
| ---------- | ------------------------------------------------------- |
| `feat`     | New feature or capability                               |
| `fix`      | Bug fix                                                 |
| `docs`     | Documentation only                                      |
| `chore`    | Tooling, config, CI, deps — no production code          |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test`     | Adding or updating tests                                |
| `perf`     | Performance improvement                                 |

### Scope

Use the task ID or service name: `P01-T005`, `ingestion`, `contracts`, `api`, etc.

### Examples

```
feat(P03-T001): add AssetIdentity schema to contracts
fix(ingestion): handle WS reconnect after 60 s silence
docs(P01-T009): add dev workflow and branch naming guide
chore(P01-T006): add ESLint flat config with typescript-eslint
```

### Rules

- Subject line: ≤ 72 characters, imperative mood ("add", not "added").
- No trailing period.
- Body (optional): explain the _why_, not the _what_. Reference task IDs where useful.
- Never skip pre-commit hooks (`--no-verify`) without a documented reason.
- Always include updated `docs/specs/cockpit_agentic_build_todo.md` checkbox and
  `progress.md` entry in the same commit as the task's code changes.

## Pull request checklist

Before opening a PR (or merging for agent tasks):

- [ ] All done-when criteria in the task are met and verified
- [ ] Checkbox flipped `[ ]` → `[x]` in the todo file
- [ ] Progress entry appended to `progress.md` (files, checks, assumptions, follow-ups)
- [ ] `bun run typecheck` — passes
- [ ] `bun run lint` — passes
- [ ] `bun run format:check` — passes
- [ ] `cargo check --workspace` — passes (if Rust files changed)
- [ ] No secrets or `.env` files committed
- [ ] No scope expansion beyond the task's agent action

## Agent task loop

Agents follow the protocol in `docs/agent_handoff.md`. Key rules:

1. Check for `.stop` at repo root before starting each task.
2. Read `progress.md` and `git log --oneline -15` for relevant prior decisions before touching shared areas.
3. One task at a time, in backlog order within the assigned phase.
4. Blocked or needs a human call → mark `[!]` in todo, log in `progress.md`, commit, stop.
