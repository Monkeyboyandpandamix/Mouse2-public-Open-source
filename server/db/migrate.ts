import { getDb } from './client.js';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.join(process.cwd(), 'server', 'db', 'migrations');

export function runMigrations(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      appliedAt TEXT NOT NULL
    )
  `);

  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const name = file;
    const row = db.prepare('SELECT name FROM _migrations WHERE name = ?').get(name);
    if (row) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      try {
        if (stmt) db.exec(stmt + ';');
      } catch (err: any) {
        if (err?.message?.includes('duplicate column name')) continue;
        throw err;
      }
    }
    db.prepare('INSERT INTO _migrations (name, appliedAt) VALUES (?, ?)').run(name, new Date().toISOString());
    console.log(`Applied migration: ${name}`);
  }
}
