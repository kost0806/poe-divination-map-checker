/**
 * 패치 단위 구조 데이터(지역별 카드 풀 / 맵 메타 / 카드 메타)를 크롤해
 * data/static.json 으로 저장한다. 수백 건을 요청하므로 서버리스 런타임이 아닌
 * 빌드·CI 단계에서만 실행한다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crawlStaticData } from '../shared/sources';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const started = Date.now();
const data = await crawlStaticData((msg) => console.log(msg));

const out = resolve(root, 'data/static.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data));

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
console.log(
  `완료 (${elapsed}s): 지역 ${data.areas.length} / 맵 ${data.maps.length} / 카드 ${data.cards.length} → ${out}`,
);
