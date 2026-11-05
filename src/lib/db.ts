import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

type Store = { db: DatabaseSync };
const globalStore = globalThis as typeof globalThis & { recallStore?: Store };

export function db() {
  if (!globalStore.recallStore) {
    mkdirSync(join(process.cwd(), 'data'), { recursive: true });
    const database = new DatabaseSync(join(process.cwd(), 'data', 'recall.sqlite'));
    database.exec(`PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, phone TEXT, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS contacts_user ON contacts(user_id);
      CREATE TABLE IF NOT EXISTS interactions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE, transcript TEXT NOT NULL, summary TEXT NOT NULL, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS interactions_contact ON interactions(user_id,contact_id,occurred_at DESC);
      CREATE TABLE IF NOT EXISTS actions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE, interaction_id TEXT REFERENCES interactions(id) ON DELETE SET NULL, kind TEXT NOT NULL, title TEXT NOT NULL, due_at TEXT, time_specified INTEGER NOT NULL DEFAULT 1, duration_minutes INTEGER NOT NULL DEFAULT 30, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, notified_at TEXT);
      CREATE INDEX IF NOT EXISTS actions_due ON actions(user_id,status,due_at);
      CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, endpoint TEXT UNIQUE NOT NULL, subscription_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS user_settings (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, push_enabled INTEGER NOT NULL DEFAULT 1, reminder_minutes INTEGER NOT NULL DEFAULT 30, sheet_webhook_url TEXT, sheet_secret TEXT, transcription_provider TEXT, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sheet_outbox (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, synced_at TEXT, error TEXT);
      CREATE INDEX IF NOT EXISTS sheet_outbox_pending ON sheet_outbox(user_id,synced_at);
    `);
    const settingsColumns=database.prepare('PRAGMA table_info(user_settings)').all() as Array<{name:string}>;
    if(!settingsColumns.some(column=>column.name==='transcription_provider'))database.exec('ALTER TABLE user_settings ADD COLUMN transcription_provider TEXT');
    const columns=database.prepare('PRAGMA table_info(actions)').all() as Array<{name:string;notnull:number}>;
    if(!columns.some(column=>column.name==='duration_minutes'))database.exec('ALTER TABLE actions ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 30');
    if(!columns.some(column=>column.name==='time_specified'))database.exec('ALTER TABLE actions ADD COLUMN time_specified INTEGER NOT NULL DEFAULT 1');
    const interactionColumns=database.prepare('PRAGMA table_info(interactions)').all() as Array<{name:string;notnull:number}>;
    if(columns.find(column=>column.name==='contact_id')?.notnull||interactionColumns.find(column=>column.name==='contact_id')?.notnull){
      database.exec(`PRAGMA foreign_keys = OFF;
        BEGIN;
        CREATE TABLE interactions_new (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE, transcript TEXT NOT NULL, summary TEXT NOT NULL, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE actions_new (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE, interaction_id TEXT REFERENCES interactions(id) ON DELETE SET NULL, kind TEXT NOT NULL, title TEXT NOT NULL, due_at TEXT, time_specified INTEGER NOT NULL DEFAULT 1, duration_minutes INTEGER NOT NULL DEFAULT 30, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, notified_at TEXT);
        INSERT INTO interactions_new SELECT id,user_id,contact_id,transcript,summary,occurred_at,created_at FROM interactions;
        INSERT INTO actions_new SELECT id,user_id,contact_id,interaction_id,kind,title,due_at,time_specified,duration_minutes,status,created_at,notified_at FROM actions;
        DROP TABLE actions;
        DROP TABLE interactions;
        ALTER TABLE interactions_new RENAME TO interactions;
        ALTER TABLE actions_new RENAME TO actions;
        CREATE INDEX interactions_contact ON interactions(user_id,contact_id,occurred_at DESC);
        CREATE INDEX actions_due ON actions(user_id,status,due_at);
        COMMIT;
        PRAGMA foreign_keys = ON;`);
    }
    const reminderColumns=database.prepare('PRAGMA table_info(actions)').all() as Array<{name:string}>;
    if(!reminderColumns.some(column=>column.name==='reminder_minutes'))database.exec('ALTER TABLE actions ADD COLUMN reminder_minutes INTEGER NOT NULL DEFAULT 0 CHECK (reminder_minutes IN (0,10,30,60,1440))');
    globalStore.recallStore = { db: database };
  }
  return globalStore.recallStore.db;
}

export const rows = <T>(statement: string, ...params: (string | number | null)[]) => db().prepare(statement).all(...params) as T[];
export const row = <T>(statement: string, ...params: (string | number | null)[]) => db().prepare(statement).get(...params) as T | undefined;
export const run = (statement: string, ...params: (string | number | null)[]) => db().prepare(statement).run(...params);
