import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

async function initDB() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');

  try {
    await pool.query(schema);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database init failed:', err);
  } finally {
    await pool.end();
  }
}

initDB();
