import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../backend/dist/index.js';

export const config = {
  runtime: 'nodejs'
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
