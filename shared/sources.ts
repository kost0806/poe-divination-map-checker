/** 원격 데이터 소스 조회 (PoEDB 스크레이핑 + 공식 리그 API) */
import { fetchJson, fetchText, mapWithConcurrency } from './http';
import {
  POEDB_BASE,
  parseAreaCards,
  parseCardLinks,
  parseCardPage,
  parseDivineChaos,
  parseEconomyTable,
  parseMapPage,
  toPriceEntries,
} from './poedb';
import type { CardInfo, LeagueInfo, MapInfo, PriceData, StaticData } from './types';

/** 커런시 익스체인지 시세 (카드 + 디바인 환율). 런타임에 주기적으로 갱신되는 부분 */
export async function fetchPrices(): Promise<PriceData> {
  const [cardsHtml, currencyHtml] = await Promise.all([
    fetchText(`${POEDB_BASE}/Economy_Divination_Cards`),
    fetchText(`${POEDB_BASE}/Economy_Currency`),
  ]);
  const divineChaos = parseDivineChaos(currencyHtml);
  const prices = toPriceEntries(parseEconomyTable(cardsHtml), divineChaos);
  if (!prices.length) throw new Error('시세 파싱 결과가 비어 있습니다');
  return { fetchedAt: new Date().toISOString(), league: null, divineChaos, prices };
}

/** 공식 API에서 현재 진행 중인 임시 리그(챌린지 리그)를 찾는다 */
export async function fetchCurrentLeague(): Promise<LeagueInfo | null> {
  const leagues = await fetchJson<
    { id: string; startAt: string | null; endAt: string | null; rules?: { id: string }[] }[]
  >('https://www.pathofexile.com/api/leagues?type=main&realm=pc');

  const permanent = new Set(['Standard', 'Hardcore', 'Solo Self-Found', 'Hardcore SSF', 'Ruthless']);
  const temporary = leagues.filter(
    (l) =>
      !permanent.has(l.id) &&
      l.startAt &&
      // 하드코어/SSF/루스리스 변형은 제외하고 기본 소프트코어 리그만 남긴다
      !/\b(HC|Hardcore|SSF|Ruthless|R)\b/.test(l.id) &&
      !(l.rules ?? []).length,
  );
  temporary.sort((a, b) => (b.startAt ?? '').localeCompare(a.startAt ?? ''));
  const current = temporary[0];
  return current ? { id: current.id, startAt: current.startAt, endAt: current.endAt } : null;
}

/** 패치 단위로만 바뀌는 구조 데이터 전체 크롤 (빌드 타임 전용, 수백 요청) */
export async function crawlStaticData(
  log: (msg: string) => void = () => {},
): Promise<StaticData> {
  log('지역별 카드 목록 조회 중...');
  const indexHtml = await fetchText(`${POEDB_BASE}/Divination_Cards`);
  const areas = parseAreaCards(indexHtml);
  const cardLinks = parseCardLinks(indexHtml);
  log(`  지역 ${areas.length}개 (맵 ${areas.filter((a) => a.isMap).length}개), 카드 ${cardLinks.size}종`);

  const mapAreas = areas.filter((a) => a.isMap);
  log(`맵 상세 ${mapAreas.length}건 조회 중...`);
  const maps = (
    await mapWithConcurrency(mapAreas, 8, async (area) => {
      try {
        const html = await fetchText(`${POEDB_BASE}/${area.slug}`);
        return parseMapPage(html, area.name, area.slug);
      } catch (err) {
        log(`  ! ${area.name} 실패: ${String(err)}`);
        return null;
      }
    })
  ).filter((m): m is MapInfo => m !== null);

  const cardEntries = [...cardLinks.entries()];
  log(`카드 상세 ${cardEntries.length}건 조회 중...`);
  const cards = (
    await mapWithConcurrency(cardEntries, 8, async ([name, slug]) => {
      try {
        const html = await fetchText(`${POEDB_BASE}/${slug}`);
        return parseCardPage(html, name, slug);
      } catch (err) {
        log(`  ! ${name} 실패: ${String(err)}`);
        return null;
      }
    })
  ).filter((c): c is CardInfo => c !== null);

  return {
    generatedAt: new Date().toISOString(),
    patchNote: 'PoEDB 최신 패치 데이터 기준',
    areas,
    maps,
    cards,
  };
}
