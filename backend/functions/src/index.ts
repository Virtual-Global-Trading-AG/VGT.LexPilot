import 'module-alias/register';
import { createExpressApp } from './app';
import * as functions from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';

// Initialize Firebase Admin
initializeApp();

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
