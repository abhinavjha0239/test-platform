// Bootstrap script - loads dotenv before importing anything else

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from monorepo root (apps/grader -> root)
config({ path: resolve(__dirname, '../../.env') });

// Now start the worker
import('./worker.js');
