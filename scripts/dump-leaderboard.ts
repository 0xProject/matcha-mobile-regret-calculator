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
    .select('id, display_name, wallet_address, chain, money_left_on_table, analyzed_at')
    .order('money_left_on_table', { ascending: false });

  if (error) { console.error('fetch error:', error.message); process.exit(1); }

  console.log(`\nAll ${data?.length ?? 0} leaderboard entries:\n`);
  console.log('#'.padEnd(4), 'DISPLAY_NAME'.padEnd(30), 'WALLET'.padEnd(46), 'CHAIN'.padEnd(8), 'HERO $');
  console.log('-'.repeat(110));
  for (let i = 0; i < (data ?? []).length; i++) {
    const r = data![i];
    const name = r.display_name == null ? '(null)' : String(r.display_name);
    console.log(
      String(i + 1).padEnd(4),
      name.slice(0, 28).padEnd(30),
      (r.wallet_address as string).padEnd(46),
      (r.chain as string).padEnd(8),
      '$' + Number(r.money_left_on_table).toFixed(2),
    );
  }
}
main();
