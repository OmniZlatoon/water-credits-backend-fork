import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { Keypair } from '@stellar/stellar-sdk';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';
import { createTestApp, runMigrations, truncateTables } from './setup';
import { StellarClient } from '../src/modules/stellar/stellar.client';
import { StellarService } from '../src/modules/stellar/stellar.service';
import { BigNumber } from 'bignumber.js';

describe('CreditsController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let projectId: string;
  let retirementQueue: Queue;
  let mockStellarClient: Partial<StellarClient>;

  beforeAll(async () => {
    mockStellarClient = {
      getServer: jest.fn().mockReturnValue({
        getLatestLedger: jest.fn().mockResolvedValue({ sequence: 12345 }),
        getEvents: jest.fn().mockResolvedValue({ records: [] })
      }),
      prepareTx: jest.fn().mockImplementation(async (tx) => tx),
      sendTxWithHash: jest.fn().mockResolvedValue({ txHash: 'mock-tx-hash-123' }),
      simulateTx: jest.fn().mockResolvedValue({ result: 'mock-sim-result' }),
      getKeypair: jest.fn().mockReturnValue(Keypair.random()),
      getSimulationKeypair: jest.fn().mockReturnValue(Keypair.random()),
    };

    const mockStellarService = {
      getBalance: jest.fn().mockResolvedValue(new BigNumber(1000)),
    };

    const testEnv = await createTestApp((builder) => {
      builder.overrideProvider(StellarClient).useValue(mockStellarClient);
      builder.overrideProvider(StellarService).useValue(mockStellarService);
    });
    
    app = testEnv.app;
    dataSource = testEnv.dataSource;
    retirementQueue = app.get(getQueueToken('retirements'));
    
    await runMigrations(dataSource);
  });

  afterAll(async () => {
    await truncateTables(dataSource);
    await app.close();
  });

  it('1. Authenticate and create project', async () => {
    const userKeypair = Keypair.random();

    // Challenge
    const challengeRes = await request(app.getHttpServer())
      .post('/api/v1/auth/challenge')
      .send({ wallet: userKeypair.publicKey() })
      .expect(200);

    const signature = userKeypair.sign(Buffer.from(challengeRes.body.challenge)).toString('hex');

    // Register
    const authRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        wallet: userKeypair.publicKey(),
        signature,
        challenge: challengeRes.body.challenge,
      })
      .expect(201);

    accessToken = authRes.body.accessToken;

    // Create Project
    const projectRes = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Credits E2E Project',
        description: 'Testing Retirements',
        latitude: 0,
        longitude: 0,
        methodology: 'Test',
        areaHectares: 10
      })
      .expect(201);

    projectId = projectRes.body.id;
    await dataSource.query(
      `UPDATE projects SET credit_token_address = $1 WHERE id = $2`,
      ['test-token', projectId],
    );
  });

  it('2. Call POST /credits/retire and assert job enqueued', async () => {
    // We expect the queue to have jobs
    const initialJobs = await retirementQueue.getJobCounts();

    const retireRes = await request(app.getHttpServer())
      .post('/api/v1/credits/retire')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        projectId,
        amount: 100,
        purpose: 'Test Retirement'
      })
      .expect(201); // Controller returns 201 Created

    const retirementId = retireRes.body.id;
    expect(retirementId).toBeDefined();

    // 1. Assert row created with empty txHash
    const retirements = await dataSource.query(`SELECT * FROM retirements WHERE id = $1`, [retirementId]);
    expect(retirements.length).toBe(1);
    expect(Number(retirements[0].amount)).toBe(100);
    expect(retirements[0].tx_hash ?? '').toBe('');

    // 2. Assert Bull job enqueued
    // Since worker might process it instantly, let's just check the job was added 
    // by either looking for it in the DB (active/completed) or by delaying the worker.
    // However, the test demands "assert Bull job visible in queue".
    const jobCounts = await retirementQueue.getJobCounts();
    const totalJobs = jobCounts.waiting + jobCounts.active + jobCounts.completed + jobCounts.delayed + jobCounts.failed;
    expect(totalJobs).toBeGreaterThan(initialJobs.waiting + initialJobs.active + initialJobs.completed + initialJobs.delayed + initialJobs.failed);
  });
});
