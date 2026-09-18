import mongoose from 'mongoose';
import { z } from 'zod';

/**
 * Every id in the API used to be a positive integer (MySQL AUTO_INCREMENT)
 * and is now a 24-character hex ObjectId. Validating the shape here means
 * a malformed id is a clean 400 from the validator rather than a CastError
 * surfacing as a 500 from deep inside a query.
 */
export const objectId = z
  .string()
  .trim()
  .refine((value) => mongoose.isValidObjectId(value), { message: 'Invalid id' });
