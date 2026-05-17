import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import { buildApp } from './app.js';

const app = await buildApp();

try {
  await app.listen({
    port: Number(process.env.PORT ?? 3001),
    host: '0.0.0.0',
  });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
