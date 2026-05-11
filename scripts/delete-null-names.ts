// Deletes leaderboard entries where display_name is null or empty.
// These show up on the leaderboard as truncated wallet addresses.
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

  // Find null/empty names
  const { data: nulls, error: selErr } = await supabase
    .from('leaderboard_entries')
    .select('id, display_name, wallet_address, money_left_on_table')
    .is('display_name', null);

  if (selErr) { console.error('select error:', selErr.message); process.exit(1); }

  // Also find empty strings (belt and suspenders)
  const { data: empties } = await supabase
    .from('leaderboard_entries')
    .select('id, display_name, wallet_address, money_left_on_table')
    .eq('display_name', '');

  const all = [...(nulls ?? []), ...(empties ?? [])];

  if (all.length === 0) {
    console.log('No null/empty display names found. Nothing to delete.');
    return;
  }

  console.log(`Found ${all.length} entries to delete:`);
  for (const r of all) {
    console.log(
      `  - ${r.id}  wallet=${r.wallet_address}  hero=$${Number(r.money_left_on_table).toFixed(2)}`,
    );
  }

  const ids = all.map((r) => r.id as string);
  const { error: delErr, count } = await supabase
    .from('leaderboard_entries')
    .delete({ count: 'exact' })
    .in('id', ids);

  if (delErr) { console.error('delete error:', delErr.message); process.exit(1); }
  console.log(`\n✅ Deleted ${count ?? ids.length} entries.`);
}
main();
