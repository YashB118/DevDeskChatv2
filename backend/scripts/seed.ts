import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import * as bcrypt from 'bcrypt';
import AppDataSource from '../src/infra/db/datasource';
import { UserEntity } from '../src/modules/users/user.entity';
import { UserRole } from '../src/modules/users/user.types';
import { loadEnv } from '../src/config/env';

loadDotenv();

interface SeedSpec {
  email: string;
  password: string;
  role: UserRole;
  displayName: string;
}

const DEFAULT_ADMIN: SeedSpec = {
  email: process.env.SEED_ADMIN_EMAIL ?? 'admin@test.com',
  password: process.env.SEED_ADMIN_PASSWORD ?? 'password123',
  role: UserRole.ADMIN,
  displayName: process.env.SEED_ADMIN_NAME ?? 'Default Admin',
};

async function upsertUser(spec: SeedSpec, bcryptCost: number): Promise<void> {
  const repo = AppDataSource.getRepository(UserEntity);
  const email = spec.email.toLowerCase();
  const existing = await repo.findOne({ where: { email } });
  const passwordHash = await bcrypt.hash(spec.password, bcryptCost);
  if (existing) {
    await repo.update(
      { id: existing.id },
      {
        passwordHash,
        role: spec.role,
        displayName: spec.displayName,
        disabled: false,
      },
    );
    console.log(`Updated user: ${email}`);
    return;
  }
  await repo.insert({
    email,
    passwordHash,
    role: spec.role,
    displayName: spec.displayName,
    disabled: false,
  });
  console.log(`Created user: ${email}`);
}

async function main(): Promise<void> {
  const env = loadEnv();
  await AppDataSource.initialize();
  try {
    await upsertUser(DEFAULT_ADMIN, env.BCRYPT_COST);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
