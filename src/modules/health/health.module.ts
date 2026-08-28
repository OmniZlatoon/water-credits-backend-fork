import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { StellarModule } from '../stellar/stellar.module';
import { OracleScheduleState } from '../oracle/entities/oracle-schedule-state.entity';
import { IndexerModule } from '../indexer/indexer.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  // OracleScheduleState backs the oracle-freshness section of the report; the
  // OracleModule registers the same entity and TypeORM deduplicates the
  // underlying repository provider. AuthModule is imported (for its exported
  // RedisService) so the report can distinguish the wallet-auth challenge
  // store from the Bull/queue Redis instance checked below (#88).
  imports: [
    TypeOrmModule.forFeature([OracleScheduleState]),
    BullModule.registerQueue(
      { name: 'sensor-ingestion' },
      { name: 'oracle-submit' },
      { name: 'retirements' },
    ),
    StellarModule,
    IndexerModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
