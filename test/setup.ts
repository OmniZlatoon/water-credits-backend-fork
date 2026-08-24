import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

export async function createTestApp(
  moduleBuilderCallback?: (builder: TestingModuleBuilder) => void
): Promise<{ app: INestApplication; dataSource: DataSource }> {
  let builder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (moduleBuilderCallback) {
    moduleBuilderCallback(builder);
  }

  const moduleFixture = await builder.compile();
  const app = moduleFixture.createNestApplication();
  
  // Set global prefix as done in main.ts
  app.setGlobalPrefix('api/v1');

  await app.init();
  const dataSource = app.get(DataSource);
  
  return { app, dataSource };
}

export async function runMigrations(dataSource: DataSource) {
  const migrationsDir = path.join(__dirname, '../src/migrations');
  const files = fs.readdirSync(migrationsDir).sort();
  
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  
  // Create migrations table if it doesn't exist
  await queryRunner.query(`
    CREATE TABLE IF NOT EXISTS test_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE
    )
  `);

  try {
    for (const file of files) {
      if (file.endsWith('.sql')) {
        const executed = await queryRunner.query(
          `SELECT * FROM test_migrations WHERE name = $1`,
          [file]
        );
        if (executed.length === 0) {
          const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
          await queryRunner.query(sql);
          await queryRunner.query(
            `INSERT INTO test_migrations (name) VALUES ($1)`,
            [file]
          );
        }
      }
    }
  } finally {
    await queryRunner.release();
  }
}

export async function truncateTables(dataSource: DataSource) {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    const tables = await queryRunner.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename != 'test_migrations'
    `);
    
    if (tables.length > 0) {
      const tableNames = tables.map((t: any) => `"${t.tablename}"`).join(', ');
      await queryRunner.query(`TRUNCATE TABLE ${tableNames} CASCADE`);
    }
  } finally {
    await queryRunner.release();
  }
}
