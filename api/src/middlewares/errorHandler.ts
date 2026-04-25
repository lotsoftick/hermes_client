/* eslint-disable no-console */
import type { ErrorRequestHandler } from 'express';

interface HttpLikeError {
  status?: number;
  statusCode?: number;
  message?: string;
  stack?: string;
}

const expressErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  const e = (error ?? {}) as HttpLikeError;
  const status = e.status || e.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const message = e.message || 'Unexpected error';

  console.error('[error]', status, message, isProd ? '' : e.stack || '');

  if (res.headersSent) {
    next(error);
    return;
  }

  res.status(status).json({
    message: isProd && status >= 500 ? 'Internal server error' : message,
    ...(isProd ? {} : { stack: e.stack }),
  });
};

export default expressErrorHandler;
