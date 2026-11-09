import type { DatabaseSync } from 'node:sqlite';
import type { BudgetRule, Reservation } from './securityCore';

export function reserveSqlite(database:DatabaseSync,rules:BudgetRule[],now=Date.now()):Reservation {
  database.exec('PRAGMA busy_timeout=3000;');
  database.exec('CREATE TABLE IF NOT EXISTS abuse_buckets (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS abuse_expiry ON abuse_buckets(expires_at);');
  database.exec('BEGIN IMMEDIATE');
  try {
    database.prepare('DELETE FROM abuse_buckets WHERE expires_at < ?').run(new Date(now-86400000).toISOString());
    for(const rule of rules){
      const old=database.prepare('SELECT count FROM abuse_buckets WHERE key=?').get(rule.key) as {count:number}|undefined;
      if((old?.count??0)>=rule.limit){database.exec('ROLLBACK');return {allowed:false,retryAfter:Math.max(1,Math.ceil((Date.parse(rule.resetAt)-now)/1000))};}
    }
    for(const rule of rules)database.prepare('INSERT INTO abuse_buckets(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(rule.key,rule.resetAt);
    database.exec('COMMIT');return {allowed:true,retryAfter:0};
  }catch(error){database.exec('ROLLBACK');throw error;}
}
