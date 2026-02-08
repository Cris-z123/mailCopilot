# mailCopilot Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-06

## Active Technologies
- Electron 29.4.6 with sandbox, contextIsolation, single-instance lock (constitution v1.1.0)
- Tailwind CSS v3.4 + shadcn/ui for utility-first styling (constitution v1.1.0)
- better-sqlite3 11.10.0 with field-level AES-256-GCM encryption, WAL mode (constitution v1.1.0)
- TypeScript 5.4 + Node.js 20.x (001-email-item-traceability)

## Project Structure

```text
src/
tests/
```

## Commands

pnpm test && pnpm run lint

## Code Style

TypeScript 5.4 + Node.js 20.x: Follow standard conventions

## Testing Requirements

Per constitution v1.1.0:
- Unit test line coverage ≥80%, branch coverage ≥70%
- Security-critical modules (encryption, validation, desensitization, sandbox) MUST achieve 100% branch coverage

## Recent Changes
- constitution v1.1.0: Updated Electron to 29.4.6, added Tailwind CSS v3.4 + shadcn/ui, updated better-sqlite3 to 11.10.0, relaxed test coverage to 80%/70%
- 001-email-item-traceability: Added TypeScript 5.4 + Node.js 20.x

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
