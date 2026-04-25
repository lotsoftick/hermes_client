import jwt, { SignOptions } from 'jsonwebtoken';
import createError from 'http-errors';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import AppDataSource from '../../data-source';
import { User, BlackList } from '../../entities';
import { Login, Logout, GetCurentUser, UserResponse } from '../../@types/user';
import { JwtPayload } from '../../@types/blacklist';

const JWT_EXPIRES_IN: SignOptions['expiresIn'] =
  (process.env.JWT_EXPIRES_IN as SignOptions['expiresIn']) || '30d';

const getCurrentUser: GetCurentUser = async (req, res, next) => {
  try {
    return res.json(req.user);
  } catch (error) {
    return next(error);
  }
};

const login: Login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('LOWER(user.email) = :email AND user.active = :active', {
        email: email.toLowerCase(),
        active: true,
      })
      .getOne();

    if (!user) return next(createError(401));

    const isSame = await bcrypt.compare(password, user.password);
    if (!isSame) return next(createError(401));

    const hash = crypto.createHash('md5').update(`${user._id}-${Math.random()}`).digest('hex');
    const token = jwt.sign(
      { id: user._id, valid: hash } satisfies JwtPayload,
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const { password: hashed, deletedAt, ...userData } = user;
    const body = { ...(userData as UserResponse), accessToken: token };
    return res.header('access-token', token).json(body);
  } catch (error) {
    return next(error);
  }
};

const logout: Logout = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return next(createError(401));

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;
    } catch {
      return next(createError(401));
    }

    const blacklistRepo = AppDataSource.getRepository(BlackList);
    await blacklistRepo.save(blacklistRepo.create({ userId: payload.id, hash: payload.valid }));

    return res.json();
  } catch (error) {
    return next(error);
  }
};

export { getCurrentUser, login, logout };
