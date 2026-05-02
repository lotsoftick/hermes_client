import AppDataSource from '../../data-source';
import { User } from '../../entities';
import { List, Get, Create, Update, Destroy } from '../../@types/user';
import { isSingleUserMode } from '../../config/singleUser';

function singleUserForbidden() {
  return { error: 'User management is disabled in single-user mode' };
}

const list: List = async (req, res, next) => {
  try {
    if (isSingleUserMode()) {
      return res.json({ total: 1, items: [req.user!] });
    }
    const { page = 0, limit = 40, sortField = 'createdAt', sortType = 'desc' } = req.query;
    const userRepo = AppDataSource.getRepository(User);

    const qb = userRepo.createQueryBuilder('user');

    if (req.query.search) {
      const search = req.query.search as string;
      if (!Number.isNaN(Number(search))) {
        qb.andWhere('user._id = :id', { id: Number(search) });
      } else {
        qb.andWhere('(user.name LIKE :s OR user.lastName LIKE :s OR user.email LIKE :s)', {
          s: `%${search}%`,
        });
      }
    }

    const total = await qb.getCount();
    const items = await qb
      .skip(Number(page) * Number(limit))
      .take(Number(limit))
      .orderBy(
        `user.${sortField as string}`,
        (sortType as string).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
      )
      .getMany();

    const sanitized = items.map(({ password, deletedAt, ...rest }) => rest);
    return res.json({ total, items: sanitized });
  } catch (error) {
    return next(error);
  }
};

const get: Get = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isSingleUserMode() && id !== req.user!._id) {
      return res.status(403).json(singleUserForbidden() as never);
    }
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ _id: id });
    if (!user) return res.json(null);
    const { password, deletedAt, ...rest } = user;
    return res.json(rest);
  } catch (error) {
    return next(error);
  }
};

const create: Create = async (req, res, next) => {
  try {
    if (isSingleUserMode()) {
      return res.status(403).json(singleUserForbidden() as never);
    }
    const userRepo = AppDataSource.getRepository(User);
    const user = userRepo.create({
      ...req.body,
      createdAt: new Date(),
    });
    const saved = await userRepo.save(user);
    const { password, deletedAt, ...rest } = saved;
    return res.json(rest);
  } catch (error) {
    return next(error);
  }
};

const update: Update = async (req, res, next) => {
  try {
    const userRepo = AppDataSource.getRepository(User);
    const id = Number(req.params.id);

    if (isSingleUserMode() && id !== req.user!._id) {
      return res.status(403).json(singleUserForbidden() as never);
    }

    const user = await userRepo.findOneBy({ _id: id });
    if (!user) return res.json(null);

    Object.assign(user, req.body, { updatedAt: new Date() });
    const saved = await userRepo.save(user);
    const { password, deletedAt, ...rest } = saved;
    return res.json(rest);
  } catch (error) {
    return next(error);
  }
};

const destroy: Destroy = async (req, res, next) => {
  try {
    if (isSingleUserMode()) {
      return res.status(403).json(singleUserForbidden() as never);
    }
    if (Number(req.params.id) === req.user!._id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    const userRepo = AppDataSource.getRepository(User);
    await userRepo.softDelete(Number(req.params.id));
    return res.json(null);
  } catch (error) {
    return next(error);
  }
};

export { list, get, create, update, destroy };
