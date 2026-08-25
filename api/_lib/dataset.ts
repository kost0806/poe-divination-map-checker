/**
 * 데이터셋 조립. 서버리스 함수 인스턴스가 살아 있는 동안 메모리에 캐시하고,
 * 원본 조회가 실패하면 저장소에 커밋된 스냅샷으로 폴백한다.
 */
import staticJson from '../../data/static.json';
import pricesJson from '../../data/prices.json';
import { calibrateGamma } from '../../shared/ev';
import { fetchCurrentLeague, fetchPrices } from '../../shared/sources';
import type { Dataset, LeagueInfo, PriceData, StaticData } from '../../shared/types';

const staticData = staticJson as unknown as StaticData;
const snapshot = pricesJson as unknown as PriceData;

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
