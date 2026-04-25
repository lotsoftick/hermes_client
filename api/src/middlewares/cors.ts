import cors from 'cors';

export default cors({
  exposedHeaders: 'access-token',
  origin: (origin, next) => {
    if (!origin || process.env.NODE_ENV === 'development') return next(null, true);

    const allowed = process.env.ALLOWED_DOMAIN
      ? process.env.ALLOWED_DOMAIN.split(',')
          .map((d) => d.trim())
          .filter(Boolean)
      : [];

    if (allowed.includes(origin)) return next(null, true);

    return next(
      new Error('The CORS policy for this site does not allow access from the specified Origin.'),
      false
    );
  },
});
