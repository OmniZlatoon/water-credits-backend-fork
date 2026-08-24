Closes #40

## Summary

- remove `synchronize: true` from TypeORM options in `src/app.module.ts` across all environments to eliminate the risk of automated silent schema drifts or data-loss during app startup.
- add `src/scripts/migration-runner.ts` as a standalone Typescript script that reliably boots up a `DataSource` from local variables and applies raw `.sql` files in `src/migrations/` sequentially.
- introduce a `schema_migrations` table during the run to idempotently track which files have been executed.
- create `src/scripts/migration-status.ts` to output a simple `[APPLIED]` / `[PENDING]` CLI log for database schema debugging.
- wire `"migration:run"` and `"migration:status"` commands into `package.json`.
- insert `npm run migration:run` directly before the `npm test` step inside `.github/workflows/ci.yml` to guarantee an authoritative Postgres schema for CI testing.

## Testing

- locally executed `npm run migration:run` which builds the isolated `DataSource` connection correctly (failing as expected when a PostgreSQL server is inaccessible, proving the DB wiring).
- verified the TS compilation integrity for all newly added script files.
- `npm run build`
