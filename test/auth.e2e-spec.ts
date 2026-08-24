import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { Keypair } from '@stellar/stellar-sdk';
import { createTestApp, runMigrations, truncateTables } from './setup';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let keypair: Keypair;
  let challengePayload: string;
  let signature: string;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const testEnv = await createTestApp();
    app = testEnv.app;
    dataSource = testEnv.dataSource;
    await runMigrations(dataSource);
  });

  afterEach(async () => {
    // Truncate only what's necessary, or all tables
    // To maintain isolation between files, we can truncate here.
    // However, this suite is self-contained.
  });

  afterAll(async () => {
    await truncateTables(dataSource);
    await app.close();
  });

  it('1. challenge -> register -> JWT issued', async () => {
    keypair = Keypair.random();

    // 1. Get Challenge
    const challengeRes = await request(app.getHttpServer())
      .post('/api/v1/auth/challenge')
      .send({ wallet: keypair.publicKey() })
      .expect(200);
      
    challengePayload = challengeRes.body.challenge;
    expect(challengePayload).toBeDefined();

    // 2. Sign Challenge
    signature = keypair.sign(Buffer.from(challengePayload)).toString('hex');

    // 3. Register user (since they don't exist yet)
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        wallet: keypair.publicKey(),
        signature,
        challenge: challengePayload,
        email: 'e2e@example.com',
        displayName: 'E2E Test User'
      })
      .expect(201);
      
    expect(registerRes.body.accessToken).toBeDefined();
    expect(registerRes.body.refreshToken).toBeDefined();
  });

  it('2. challenge -> login -> JWT issued', async () => {
    // Get new challenge for login
    const challengeRes = await request(app.getHttpServer())
      .post('/api/v1/auth/challenge')
      .send({ wallet: keypair.publicKey() })
      .expect(200);
      
    challengePayload = challengeRes.body.challenge;
    
    // Sign new challenge
    signature = keypair.sign(Buffer.from(challengePayload)).toString('hex');

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        wallet: keypair.publicKey(),
        signature,
        challenge: challengePayload
      })
      .expect(200);

    accessToken = loginRes.body.accessToken;
    refreshToken = loginRes.body.refreshToken;

    expect(accessToken).toBeDefined();
    expect(refreshToken).toBeDefined();
  });

  it('3. refresh -> new JWT', async () => {
    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.accessToken).not.toEqual(accessToken);
    expect(refreshRes.body.refreshToken).toBeDefined();
    
    // Update tokens for logout
    accessToken = refreshRes.body.accessToken;
    refreshToken = refreshRes.body.refreshToken;
  });

  it('4. logout -> session invalidated', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    // Verify refresh fails
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });
});
