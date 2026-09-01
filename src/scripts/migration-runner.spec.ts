import { migrationRequiresNoTransaction } from './migration-runner';

describe('migrationRequiresNoTransaction', () => {
  it('detects CREATE INDEX CONCURRENTLY statements', () => {
    const sql = `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_example
      ON oracle_submissions USING gin (readings_snapshot);
    `;

    expect(migrationRequiresNoTransaction(sql)).toBe(true);
  });

  it('keeps normal transactional DDL in the transaction path', () => {
    const sql = `
      ALTER TABLE oracle_submissions
      ADD COLUMN status text NOT NULL DEFAULT 'pending';
    `;

    expect(migrationRequiresNoTransaction(sql)).toBe(false);
  });
});
