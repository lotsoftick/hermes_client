import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AppDataSource from './data-source';
import { User } from './entities';
import { isSingleUserMode } from './config/singleUser';

export default async function seedAdminUser(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const activeUsersCount = await userRepo.count({ where: { active: true } });
  if (activeUsersCount > 0) return;

  const password = crypto.randomBytes(12).toString('base64url');

  const admin = userRepo.create({
    email: 'admin@admin.com',
    password,
    name: 'Admin',
    lastName: 'User',
    phone: '1234567890',
    active: true,
    createdAt: new Date(),
  });
  await userRepo.save(admin);

  const dir = path.join(os.homedir(), '.hermes_client');
  const bootstrapFile = path.join(dir, 'bootstrap-admin.txt');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    bootstrapFile,
    [
      'Hermes Client bootstrap login',
      `mode=${isSingleUserMode() ? 'single-user' : 'multi-user'}`,
      'email=admin@admin.com',
      `password=${password}`,
      '',
      'Change this password after first login.',
      '',
    ].join('\n'),
    'utf-8'
  );
  // eslint-disable-next-line no-console
  console.log(`[auth] bootstrap admin credentials written to ${bootstrapFile}`);
}
