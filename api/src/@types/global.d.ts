import { UserResponse } from './user';

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'test' | 'development' | 'production';
      JWT_SECRET: string;
      ALLOWED_DOMAIN?: string;
      HERMES_STRICT_CORS?: string;
    }
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: UserResponse;
    }
  }
}

export {};
