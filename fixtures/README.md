# fixtures

Static JSON/YAML fixtures used for fixture-first development and CI tests.
Services must work correctly against these fixtures without live providers or
LLM secrets.

Owned by: all agents — each adds fixtures for their domain.
Validated by: `packages/contracts` schema tests (P03-T015).
Never contains: real API keys, live credentials, or personally identifiable data.
