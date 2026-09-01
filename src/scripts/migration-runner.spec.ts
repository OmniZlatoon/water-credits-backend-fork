import { migrationRequiresNoTransaction, splitSqlStatements } from './migration-runner';

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

  it('splits a multi-statement concurrent index migration into individual queries', () => {
    const sql = `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_a ON table_a (id);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_b ON table_b (id);
      ALTER TABLE table_a ADD COLUMN foo text;
    `;

    expect(splitSqlStatements(sql)).toHaveLength(3);
    expect(splitSqlStatements(sql)[0]).toContain('CREATE INDEX CONCURRENTLY');
  });

  it('ignores explanatory prose that is not SQL', () => {
    const sql = `
      Some explanatory text before the migration.

      ALTER TABLE oracle_submissions
        ADD COLUMN status text NOT NULL DEFAULT 'pending';

      Further notes about the migration are not executable SQL.
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_example
        ON oracle_submissions USING gin (readings_snapshot);
    `;

    const statements = splitSqlStatements(sql);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('ALTER TABLE oracle_submissions');
    expect(statements[1]).toContain('CREATE INDEX CONCURRENTLY');
  });
});
