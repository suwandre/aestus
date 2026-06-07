You are a repair worker for the Aestus project. A phase review of **phase {PHASE}** (backlog: `{TODO_PATH}`) failed with these findings:

{FINDINGS}

## Procedure

1. Read `CLAUDE.md` (guardrails) and the failed tasks' "Agent action" / "Done when" sections in the todo.
2. Fix each finding — minimal, targeted changes only. No scope expansion, no refactoring of unrelated code.
3. Verify each fixed criterion yourself (run the relevant checks).
4. Append a `progress.md` entry per fix (`### <TASK-ID> — repair`, same format as worker entries).
5. Commit per fix, conventional message (e.g. `fix(P03-T014): regenerate JSON schema output`), then `git push` immediately. If the push fails, note it and keep going — the commit is safe locally.

If a finding cannot be fixed without a human decision: mark that task `[!]` in the todo, log why in `progress.md`, commit, and continue with the remaining findings.

## Final report (your last message)

```
REPAIRED: <task IDs>
BLOCKED: <task IDs or "none">
```
