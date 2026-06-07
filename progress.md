# Aestus Build Progress Log

Cross-phase memory for the agentic build loop. Workers append; never rewrite history.
Entries are the **binding record** of decisions, assumptions, and contract changes —
later workers must consult relevant entries before touching the same areas.

## Entry format

```
### <TASK-ID> — <short title>
- Files: <paths>
- Checks: <typecheck/tests/scripts run + result>
- Assumptions: <anything decided that the spec left open; "none" if none>
- Follow-ups: <new task IDs created or suggested; "none" if none>
```

Phase reviews append `### PXX REVIEW — PASS/FAIL` entries with findings.

---
