import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export async function createMigrationDataSource(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'water_credits',
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? {
            rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
            ca: process.env.DATABASE_SSL_CA
              ? fs.readFileSync(process.env.DATABASE_SSL_CA)
              : undefined,
          }
        : undefined,
  });

  await dataSource.initialize();
  return dataSource;
}

export function migrationRequiresNoTransaction(sql: string): boolean {
  return /CREATE\s+INDEX\s+CONCURRENTLY\b/i.test(sql);
}

export async function runMigrations() {
  const dataSource = await createMigrationDataSource();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationsDir = path.join(__dirname, '../migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found.');
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      const existing = await queryRunner.query(`SELECT id FROM schema_migrations WHERE name = $1`, [
        file,
      ]);

      if (existing.length === 0) {
        console.log(`Applying migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        const requiresNoTransaction = migrationRequiresNoTransaction(sql);

        if (requiresNoTransaction) {
          try {
            await queryRunner.query(sql);
            await queryRunner.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
            appliedCount++;
            console.log(`✅ Applied: ${file}`);
          } catch (error) {
            console.error(`❌ Failed to apply migration: ${file}`, error);
            throw error;
          }
        } else {
          await queryRunner.startTransaction();
          try {
            await queryRunner.query(sql);
            await queryRunner.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
            await queryRunner.commitTransaction();
            appliedCount++;
            console.log(`✅ Applied: ${file}`);
          } catch (error) {
            await queryRunner.rollbackTransaction();
            console.error(`❌ Failed to apply migration: ${file}`, error);
            throw error;
          }
        }
      }
    }

    if (appliedCount === 0) {
      console.log('No pending migrations to apply.');
    } else {
      console.log(`Successfully applied ${appliedCount} migrations.`);
    }
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

if (require.main === module) {
  runMigrations().catch((err) => {
    console.error('Migration runner failed:', err);
    process.exit(1);
  });
}
