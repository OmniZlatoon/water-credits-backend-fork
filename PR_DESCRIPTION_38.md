Closes #38

## Summary

- create `test/setup.ts` with a `createTestApp()` helper to bootstrap the `AppModule`, run all SQL migrations manually against the test database, and expose a `truncateTables()` utility for test isolation.
- add `test/auth.e2e-spec.ts` to execute the full authentication lifecycle (challenge → sign → register/login → JWT → refresh → logout) using a real Stellar keypair.
- add `test/sensors.e2e-spec.ts` to test device registration, plaintext API key issuance, and ingestion of a cryptographically signed sensor reading using the `X-API-Key` header.
- add `test/credits.e2e-spec.ts` to mock `StellarClient` RPC calls and test the POST `/credits/retire` endpoint, asserting that a `Retirement` row is persisted with an empty `txHash` and the job is successfully queued in Bull.
- update `.github/workflows/ci.yml` to run `npm run test:e2e` with `DB_DATABASE=water_credits_test` after the unit test step to fully integrate with the existing Postgres and Redis CI services.

## Testing

- verified all e2e spec files run successfully against a seeded PostgreSQL test database.
- verified that `StellarClient` overrides work correctly without making actual outbound testnet RPC requests.
- ensured tests do not leak data across test suites by truncating the database `afterAll`.
- `npm run test:e2e`
- `npm run build`
