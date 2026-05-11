import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envPath = '/Users/emanuelelanni/Desktop/Projects/SL:TP growth tool/.env.local';
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq < 0) continue;
  if (!process.env[t.slice(0, eq)]) process.env[t.slice(0, eq)] = t.slice(eq + 1);
}

async function main() {
const url = process.env.SUPABASE_URL as string;
const key = process.env.SUPABASE_ANON_KEY as string;
const supabase = createClient(url, key);

const { data, error } = await supabase
  .from('leaderboard_entries')
  .select('id, display_name, wallet_address, chain, money_left_on_table, analyzed_at');

if (error) { console.error('fetch error:', error.message); process.exit(1); }

const EVM_FULL = /^0x[0-9a-fA-F]{40}$/;
const EVM_ANY_0X = /^0x[0-9a-fA-F]{2,}/i;
const SOLANA_FULL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TRUNCATED = /^[1-9A-HJ-NP-Za-km-z0x]{3,}\.{2,3}[1-9A-HJ-NP-Za-km-z]{3,}$/i;

function looksLikeWallet(name: string | null): string | null {
  if (!name) return 'null/empty name';
  const n = name.trim();
  if (EVM_FULL.test(n)) return 'full EVM address';
  if (SOLANA_FULL.test(n) && n.length >= 32) return 'full Solana address';
  if (TRUNCATED.test(n)) return 'truncated address';
  if (EVM_ANY_0X.test(n)) return 'starts with 0x';
  return null;
}

console.log(`\nTotal leaderboard entries: ${data?.length ?? 0}\n`);

type Row = { id: string; display_name: string; reason: string; wallet: string; chain: string; money: number };
const suspicious: Row[] = [];
for (const row of data ?? []) {
  const reason = looksLikeWallet(row.display_name as string);
  if (reason) {
    suspicious.push({
      id: row.id as string,
      display_name: row.display_name as string,
      reason,
      wallet: row.wallet_address as string,
      chain: row.chain as string,
      money: Number(row.money_left_on_table),
    });
  }
}

if (suspicious.length === 0) {
  console.log('No wallet-like display names found. Nothing to clean up.');
  process.exit(0);
}

console.log(`Found ${suspicious.length} entries with wallet-like display names:\n`);
console.log('#'.padEnd(4), 'DISPLAY_NAME'.padEnd(45), 'CHAIN'.padEnd(8), 'REASON'.padEnd(22), 'HERO $');
console.log('-'.repeat(100));
for (let i = 0; i < suspicious.length; i++) {
  const s = suspicious[i];
  const displayText = s.display_name == null ? '(null)' : String(s.display_name).slice(0, 43);
  console.log(
    String(i + 1).padEnd(4),
    displayText.padEnd(45),
    (s.chain ?? '?').padEnd(8),
    s.reason.padEnd(22),
    '$' + s.money.toFixed(2),
  );
}
console.log(`\nIDs: ${suspicious.map((s) => s.id).join(',')}`);
}
main();
