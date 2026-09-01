import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { Keypair } from '@stellar/stellar-sdk';
import { createTestApp, runMigrations, truncateTables } from './setup';

describe('SensorsController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let projectId: string;
  let apiKeyPlaintext: string;
  let deviceKeypair: Keypair;
  let deviceId = 'sensor-test-01';

  beforeAll(async () => {
    const testEnv = await createTestApp();
    app = testEnv.app;
    dataSource = testEnv.dataSource;
    await runMigrations(dataSource);
  });

  afterAll(async () => {
    await truncateTables(dataSource);
    await app.close();
  });

  it('1. Register user and create project', async () => {
    const userKeypair = Keypair.random();

    const challengeRes = await request(app.getHttpServer())
      .post('/api/v1/auth/challenge')
      .send({ wallet: userKeypair.publicKey() })
      .expect(200);

    const signature = userKeypair.sign(Buffer.from(challengeRes.body.challenge)).toString('hex');

    const authRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        wallet: userKeypair.publicKey(),
        signature,
        challenge: challengeRes.body.challenge,
      })
      .expect(201);

    accessToken = authRes.body.accessToken;

    const projectRes = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Test Project',
        description: 'Test Project for Sensors',
        latitude: 0,
        longitude: 0,
        methodology: 'Test',
        areaHectares: 10
      })
      .expect(201);

    projectId = projectRes.body.id;
    expect(projectId).toBeDefined();
  });

  it('2. Register device and get API key', async () => {
    deviceKeypair = Keypair.random();

    const deviceRes = await request(app.getHttpServer())
      .post('/api/v1/sensors/devices')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        projectId,
        deviceId,
        manufacturer: 'TestMaker',
        model: 'TestModel1',
        publicKey: deviceKeypair.publicKey(),
        parameters: ['ph', 'temperature']
      })
      .expect(201);

    apiKeyPlaintext = deviceRes.body.apiKeyPlaintext;
    expect(apiKeyPlaintext).toBeDefined();
  });

  it('3. Submit signed reading and assert persistence', async () => {
    const timestamp = new Date().toISOString();
    
    // Build payload to sign (deviceId|timestamp|ph|turbidity|dissolvedOxygen|flowRate|nitrogen|phosphorus|temperature)
    const payload = `${deviceId}|${timestamp}|7.5||||||22.5`;
    const signature = deviceKeypair.sign(Buffer.from(payload, 'utf-8')).toString('base64');

    const readingRes = await request(app.getHttpServer())
      .post('/api/v1/sensors/readings')
      .set('X-API-Key', apiKeyPlaintext)
      .send({
        deviceId,
        timestamp,
        ph: 7.5,
        temperature: 22.5,
        signature
      })
      .expect(201);

    expect(readingRes.body.id).toBeDefined();
    expect(readingRes.body.ph).toBe(7.5);
    expect(readingRes.body.temperature).toBe(22.5);

    // Verify batch was created
    const batchId = readingRes.body.batchId;
    expect(batchId).toBeDefined();

    // Check DB directly
    const batches = await dataSource.query(`SELECT * FROM reading_batches WHERE id = $1`, [batchId]);
    expect(batches.length).toBe(1);
    expect(batches[0].reading_count).toBeGreaterThanOrEqual(1);
  });
});
