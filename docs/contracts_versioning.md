# Contracts & Schema Versioning

How to evolve the shared data contracts in `packages/contracts` without breaking the
services and frontend that depend on them. Read this before changing any schema.

## Where contracts live

- **Source of truth:** Zod schemas in `packages/contracts/src/*.ts`, re-exported from
  `src/index.ts`. TypeScript types are inferred from these (`z.infer`), so the type and the
  runtime validator never drift.
- **Generated JSON Schema:** `packages/contracts/schema/*.schema.json` (draft 2020-12),
  produced by `bun run gen:schema`. These let the backend and frontend validate without
  importing the runtime Zod code. **Never hand-edit them** — regenerate instead.
- **Fixtures:** `fixtures/**/*.json`. Every fixture is validated against its contract by
  `packages/contracts/test/fixtures.test.ts` in CI.

## The `schema_version` field

Every **event envelope** carries an integer `schema_version` (see `SCHEMA_VERSION` in
`src/common.ts`). It identifies the wire format so consumers and stored/replayed events can be
routed by version. Schemas that carry it today: `RawMarketEvent`, `NormalizedMarketEvent`,
`OnChainEvent`, `FeatureSnapshot`, `AnomalyEvent` (via the event types that embed it),
`ContextPacket`, `Briefing`, `Decision`, `JournalTrade`.

Reference data that is looked up by id rather than streamed (`AssetIdentity`, `Venue`,
`VenueInstrument`, `MacroEvent`, `NewsItem`) is not versioned per-record; it evolves through
storage migrations (P04) instead.

`SCHEMA_VERSION` is currently `1`. Bump it **only** for a breaking change (below), and only
once per release that ships breaking changes — not once per field.

## Breaking vs non-breaking changes

A change is **non-breaking** if every previously valid payload is still valid and every
consumer keeps working. These do **not** require a version bump:

- Adding an **optional** field (`.optional()`), or a field with a `.default()`.
- Adding a new **variant** to a discriminated union (`NormalizedMarketEvent`, `OnChainEvent`) —
  existing consumers ignore types they don't handle.
- Adding a new value to an enum **only if** consumers already treat unknown values defensively.
  When in doubt, treat enum widening as breaking.
- Loosening a constraint (e.g. widening a numeric range).

A change is **breaking** and **requires bumping `SCHEMA_VERSION`**:

- Removing or renaming a field, or changing its type.
- Making an optional field required, or removing a default.
- Tightening a constraint (e.g. adding `min`, narrowing an enum) so old payloads fail.
- Changing the discriminator key or the meaning of an existing variant.

## Migration process

1. **Edit the Zod schema** in `packages/contracts/src/`. Prefer additive, optional changes.
2. **If the change is breaking,** bump `SCHEMA_VERSION` in `src/common.ts` and write a migration
   note (below). Producers stamp the new version; consumers branch on `schema_version` until all
   stored/in-flight data is at the new version.
3. **Update fixtures** under `fixtures/` so they reflect the new shape (and add a fixture for any
   new variant). Update the contract map in `test/fixtures.test.ts` if you added a fixture file.
4. **Regenerate JSON Schema:** `bun run gen:schema` (from `packages/contracts`).
5. **Update downstream** in the same change set when a contract boundary moves — shared schemas,
   fixtures, API docs, and frontend types together (CLAUDE.md hard rule #8).
6. **Verify:** `bun run typecheck`, `bun test`, `bun run format:check`, `bunx eslint .`.
7. **Record a migration note** in the table below.

## Migration notes

| Version | Date       | Change                                   | Notes                          |
| ------- | ---------- | ---------------------------------------- | ------------------------------ |
| 1       | 2026-06-07 | Initial contract set (P03-T001–P03-T013) | Baseline; no migration needed. |

When you bump the version, append a row here describing what changed and how to migrate stored
data or in-flight consumers.

## Compatibility rules of thumb

- **Producers** always stamp the current `SCHEMA_VERSION`.
- **Consumers** validate against the contract and should tolerate unknown enum values / union
  variants where the domain allows it.
- **Stored events** keep the `schema_version` they were written with; readers migrate on read or
  via a backfill, never by silently reinterpreting old bytes.
