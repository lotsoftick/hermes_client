import jwt from 'jsonwebtoken';
import { RequestHandler } from 'express';
import createError from 'http-errors';
import AppDataSource from '../data-source';
import { User, BlackList } from '../entities';
import { JwtPayload } from '../@types/blacklist';

const auth: RequestHandler = async (req, res, next) => {
  try {
    const { authorization = '' } = req.headers;
    const token = authorization.replace('Bearer ', '');

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;
    } catch {
      return next(createError(401));
    }

    const { id, valid } = payload;
    if (!id || !valid) return next(createError(401));

    const blacklistRepo = AppDataSource.getRepository(BlackList);
    const isBlackListed = await blacklistRepo.findOneBy({ userId: id, hash: valid });
    if (isBlackListed) return next(createError(401));

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ _id: id, active: true });
    if (!user) return next(createError(401));

    req.user = user;

    return next();
  } catch (e) {
    return next(createError(401));
  }
};

export default auth;
