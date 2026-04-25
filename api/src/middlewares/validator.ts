import { validationResult, ValidationChain } from 'express-validator';
import type { RequestHandler } from 'express';

const validate =
  (validations: ValidationChain[]): RequestHandler =>
  async (req, res, next) => {
    try {
      await Promise.all(validations.map((validation) => validation.run(req)));
      const errors = validationResult(req);

      if (errors.isEmpty()) return next();

      const errorMessages: Record<string, string[]> = {};
      errors.array().forEach(({ param, msg }) => {
        if (errorMessages[param]) errorMessages[param].push(msg);
        else errorMessages[param] = [msg];
      });

      return res.status(422).json(errorMessages);
    } catch (error) {
      return next(error);
    }
  };

export default validate;
