/**
 * 시세 스냅샷을 갱신한다. 런타임 API는 매번 PoEDB를 직접 조회하지만,
 * 조회가 실패했을 때 폴백으로 쓸 최근 스냅샷을 저장소에 함께 커밋해 둔다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCurrentLeague, fetchPrices } from '../shared/sources.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const [prices, league] = await Promise.all([
  fetchPrices(),
  fetchCurrentLeague().catch(() => null),
]);
prices.league = league?.id ?? null;

const out = resolve(root, 'data/prices.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(prices));
console.log(
  `시세 ${prices.prices.length}종 저장 (리그: ${prices.league ?? '알 수 없음'}, 1 디바인 = ${prices.divineChaos} 카오스) → ${out}`,
);
