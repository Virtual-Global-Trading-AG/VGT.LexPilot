import 'module-alias/register';
import { createExpressApp } from './app';
import { onRequest } from 'firebase-functions/v2/https';
import { Request, Response } from 'express';

// Create Express App
const createApp = async () => {
  return await createExpressApp();
};

// Export Firebase Function with 5 minute timeout
export const api = onRequest(
  {
    timeoutSeconds: 300, // 5 minutes
    memory: '1GiB', // Increase memory for better performance during indexing
  },
  async (req: Request, res: Response) => {
    const app = await createApp();
    app(req, res);
  }
);

// Export Express App für lokalen Development
export { createExpressApp };
