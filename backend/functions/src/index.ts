import 'module-alias/register';
import { createExpressApp } from './app';
import * as functions from 'firebase-functions';

// Create Express App
const createApp = async () => {
  return await createExpressApp();
};

// Export Firebase Function
export const api = functions.https.onRequest(async (req, res) => {
  const app = await createApp();
  app(req, res);
});

// Export Express App für lokalen Development
export { createExpressApp };
