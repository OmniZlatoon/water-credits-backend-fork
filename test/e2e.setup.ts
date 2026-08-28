import { randomUUID } from 'crypto';
import { DataType, newDb } from 'pg-mem';

process.env.NODE_ENV = 'test';
process.env.E2E_IN_MEMORY = 'true';

jest.setTimeout(30_000);

const database = newDb();
database.public.registerFunction({
	name: 'version',
	returns: DataType.text,
	implementation: () => 'PostgreSQL 15.0 (pg-mem)',
});
database.public.registerFunction({
	name: 'current_database',
	returns: DataType.text,
	implementation: () => 'water_credits_test',
});
database.public.registerFunction({
	name: 'uuid_generate_v4',
	returns: DataType.uuid,
	implementation: () => randomUUID(),
});
database.public.registerFunction({
	name: 'gen_random_uuid',
	returns: DataType.uuid,
	implementation: () => randomUUID(),
});

jest.setMock('pg', database.adapters.createPg());
jest.setMock('ioredis', require('ioredis-mock'));
