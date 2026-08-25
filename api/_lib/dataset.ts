/**
 * 데이터셋 조립. 서버리스 함수 인스턴스가 살아 있는 동안 메모리에 캐시하고,
 * 원본 조회가 실패하면 저장소에 커밋된 스냅샷으로 폴백한다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calibrateGamma } from '../../shared/ev.js';
import { fetchCurrentLeague, fetchPrices } from '../../shared/sources.js';
import type { Dataset, LeagueInfo, PriceData, StaticData } from '../../shared/types.js';

/**
 * 데이터 파일은 import 하지 않고 직접 읽는다.
 * 루트 package.json 이 ESM 이라 서버리스 함수도 실제 ESM 으로 실행되는데,
 * ESM 에서 JSON import 는 import attribute 를 요구하고 번들 여부에 따라 경로도 달라진다.
 * 실행 위치(프로젝트 루트)와 이 파일 기준 경로를 모두 시도하면 번들/비번들 양쪽에서 동작한다.
 */
function loadJson<T>(relativePath: string): T {
  const candidates = [
    resolve(process.cwd(), relativePath),
    fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return JSON.parse(readFileSync(candidate, 'utf8')) as T;
  }
  throw new Error(`데이터 파일을 찾지 못했습니다: ${relativePath} (${candidates.join(', ')})`);
}

const staticData = loadJson<StaticData>('data/static.json');
const snapshot = loadJson<PriceData>('data/prices.json');

const PRICE_TTL_MS = 30 * 60 * 1000;
const LEAGUE_TTL_MS = 6 * 60 * 60 * 1000;

interface Cached<T> {
  value: T;
  at: number;
}

let priceCache: Cached<PriceData> | null = null;
let leagueCache: Cached<LeagueInfo | null> | null = null;
let priceStale = false;

const fresh = <T>(c: Cached<T> | null, ttl: number) => (c && Date.now() - c.at < ttl ? c : null);

async function getPrices(): Promise<PriceData> {
  const cached = fresh(priceCache, PRICE_TTL_MS);
  if (cached) return cached.value;
  try {
    const value = await fetchPrices();
    priceCache = { value, at: Date.now() };
    priceStale = false;
    return value;
  } catch {
    // PoEDB 조회 실패(차단·장애 등) — 커밋된 스냅샷으로 서비스는 계속한다
    priceStale = true;
    return priceCache?.value ?? snapshot;
  }
}

async function getLeague(): Promise<LeagueInfo | null> {
  const cached = fresh(leagueCache, LEAGUE_TTL_MS);
  if (cached) return cached.value;
  try {
    const value = await fetchCurrentLeague();
    leagueCache = { value, at: Date.now() };
    return value;
  } catch {
    return leagueCache?.value ?? null;
  }
}

export async function buildDataset(): Promise<Dataset> {
  const [prices, league] = await Promise.all([getPrices(), getLeague()]);
  return {
    static: staticData,
    prices,
    league,
    stale: priceStale,
    calibration: calibrateGamma({
      areas: staticData.areas,
      maps: staticData.maps,
      cards: staticData.cards,
      prices: prices.prices,
    }),
  };
}
