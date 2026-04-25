import AppDataSource from './data-source';
import { User } from './entities';

export default async function seedAdminUser(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const activeUsersCount = await userRepo.count({ where: { active: true } });
  if (activeUsersCount > 0) return;

  const admin = userRepo.create({
    email: 'admin@admin.com',
    password: '123456',
    name: 'Admin',
    lastName: 'User',
    phone: '1234567890',
    active: true,
    createdAt: new Date(),
  });
  await userRepo.save(admin);
}
