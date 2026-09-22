import { z } from 'zod';

/**
 * Every id in the API is a uuid (see the note on ids in
 * migrations/001_init.sql). Validating the shape here means a malformed
 * id is a clean 400 from the validator, rather than Postgres rejecting
 * it as `invalid input syntax for type uuid` from deep inside a query.
 */
export const uuid = z.string().trim().uuid({ message: 'Invalid id' });
