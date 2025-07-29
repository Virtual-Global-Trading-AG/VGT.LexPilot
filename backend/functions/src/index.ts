import 'module-alias/register';
import { createExpressApp } from './app';
import * as functions from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';

// Initialize Firebase Admin only if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

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
