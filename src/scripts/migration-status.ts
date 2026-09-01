import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { createMigrationDataSource } from './migration-runner';

async function showStatus() {
  const dataSource = await createMigrationDataSource();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    let applied: string[] = [];
    try {
      const records = await queryRunner.query(`SELECT name FROM schema_migrations ORDER BY id ASC`);
      applied = records.map((r: any) => r.name);
    } catch {
      // Table might not exist yet
    }

    const migrationsDir = path.join(__dirname, '../migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found.');
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log('\n--- Migration Status ---');
    for (const file of files) {
      if (applied.includes(file)) {
        console.log(`[APPLIED] ${file}`);
      } else {
        console.log(`[PENDING] ${file}`);
      }
    }
    console.log('------------------------\n');
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

if (require.main === module) {
  showStatus().catch((err) => {
    console.error('Failed to get migration status:', err);
    process.exit(1);
  });
}
