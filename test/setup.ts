import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { getQueueToken } from '@nestjs/bull';
import { ExpressAdapter } from '@nestjs/platform-express';
import { RedisService } from '../src/modules/auth/redis.service';
import { SensorsGateway } from '../src/modules/sensors/sensors.gateway';
import { NotificationsGateway } from '../src/modules/notifications/notifications.gateway';

function createMemoryQueue() {
  let totalJobs = 0;
  const client = { ping: async () => 'PONG' };

  return {
    client,
    process: () => undefined,
    on: () => undefined,
    add: async () => {
      totalJobs += 1;
      return { id: String(totalJobs) };
    },
    getJobCounts: async () => ({
      waiting: totalJobs,
      active: 0,
      completed: 0,
      delayed: 0,
      failed: 0,
    }),
  };
}

function createMemoryRedis() {
  const values = new Map<string, string>();
  return {
    getClient: () => ({
      get: async (key: string) => values.get(key) ?? null,
      getdel: async (key: string) => {
        const value = values.get(key) ?? null;
        values.delete(key);
        return value;
      },
      set: async (key: string, value: string) => {
        values.set(key, value);
        return 'OK';
      },
      del: async (key: string) => Number(values.delete(key)),
      incr: async (key: string) => {
        const value = Number(values.get(key) ?? '0') + 1;
        values.set(key, String(value));
        return value;
      },
      expire: async () => 1,
    }),
    ping: async () => undefined,
  };
}

export async function createTestApp(
  moduleBuilderCallback?: (builder: TestingModuleBuilder) => void
): Promise<{ app: INestApplication; dataSource: DataSource }> {
  let builder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (moduleBuilderCallback) {
    moduleBuilderCallback(builder);
  }

  for (const queueName of ['sensor-ingestion', 'oracle-submit', 'retirements']) {
    builder.overrideProvider(getQueueToken(queueName)).useValue(createMemoryQueue());
  }
  builder.overrideProvider(RedisService).useValue(createMemoryRedis());
  builder.overrideProvider(SensorsGateway).useValue({
    emitReading: async () => undefined,
    emitAlert: async () => undefined,
  });
  builder.overrideProvider(NotificationsGateway).useValue({
    broadcast: async () => undefined,
    sendToUser: async () => undefined,
  });

  const moduleFixture = await builder.compile();
  const app = moduleFixture.createNestApplication(new ExpressAdapter());
  
  // Set global prefix as done in main.ts
  app.setGlobalPrefix('api/v1');

  await app.init();
  const dataSource = app.get(DataSource);
  
  return { app, dataSource };
}

export async function runMigrations(dataSource: DataSource) {
  void dataSource;
}

export async function truncateTables(dataSource: DataSource) {
  if (!dataSource.isInitialized) {
    return;
  }

  for (const metadata of dataSource.entityMetadatas) {
    await dataSource.query(`TRUNCATE TABLE "${metadata.tableName}" CASCADE`);
  }
}
