import { Request } from 'express';
import { AbortController } from 'abort-controller';

interface JwtPayload {
  username: string;
  client: string;
  id?: number;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      abortController?: AbortController;
    }
  }
}
