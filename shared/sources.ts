/** 원격 데이터 소스 조회 (PoEDB 스크레이핑 + 공식 리그 API) */
import { fetchJson, fetchText, mapWithConcurrency } from './http.js';
import {
  POEDB_BASE,
  poedbBase,
  parseAreaCards,
  parseCardLinks,
  parseCardPage,
  parseDivineChaos,
  parseEconomyTable,
  parseMapPage,
  toPriceEntries,
} from './poedb.js';
import type { CardInfo, LeagueInfo, MapInfo, PriceData, StaticData } from './types.js';

/** 화폐 거래소 시세 (카드 + 신성한 오브 환율). 런타임에 주기적으로 갱신되는 부분 */
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

/** 슬러그 기준으로 한 로케일의 지도/카드 상세를 모두 가져온다 */
async function crawlPages<T>(
  locale: 'us' | 'kr',
  entries: { name: string; slug: string }[],
  parse: (html: string, name: string, slug: string) => T,
  log: (msg: string) => void,
): Promise<Map<string, T>> {
  const base = poedbBase(locale);
  const parsed = await mapWithConcurrency(entries, 8, async (entry) => {
    try {
      const html = await fetchText(`${base}/${entry.slug}`);
      return [entry.slug, parse(html, entry.name, entry.slug)] as const;
    } catch (err) {
      log(`  ! [${locale}] ${entry.name} 실패: ${String(err)}`);
      return null;
    }
  });
  return new Map(parsed.filter((p): p is NonNullable<typeof p> => p !== null));
}

/**
 * 패치 단위로만 바뀌는 구조 데이터 전체 크롤 (빌드 타임 전용, 수백 요청).
 * 영문판을 기준으로 삼고 한국어판에서 공식 번역명을 덧붙인다.
 */
export async function crawlStaticData(
  log: (msg: string) => void = () => {},
): Promise<StaticData> {
  log('지역별 카드 목록 조회 중...');
  const [indexHtml, indexHtmlKo] = await Promise.all([
    fetchText(`${POEDB_BASE}/Divination_Cards`),
    fetchText(`${poedbBase('kr')}/Divination_Cards`),
  ]);
  const areas = parseAreaCards(indexHtml);
  const cardLinks = parseCardLinks(indexHtml);
  // 한국어판은 같은 슬러그를 쓰므로 슬러그로 이름만 갈아끼운다
  const areaNameKo = new Map(parseAreaCards(indexHtmlKo).map((a) => [a.slug, a.name]));
  const cardNameKo = new Map([...parseCardLinks(indexHtmlKo)].map(([name, slug]) => [slug, name]));
  for (const area of areas) area.nameKo = areaNameKo.get(area.slug) ?? null;
  log(`  지역 ${areas.length}개 (지도 ${areas.filter((a) => a.isMap).length}개), 카드 ${cardLinks.size}종`);

  const mapEntries = areas.filter((a) => a.isMap).map((a) => ({ name: a.name, slug: a.slug }));
  const cardEntries = [...cardLinks.entries()].map(([name, slug]) => ({ name, slug }));

  log(`지도 상세 ${mapEntries.length}건 · 카드 상세 ${cardEntries.length}건 조회 중 (영문/한국어)...`);
  const [mapsUs, mapsKo, cardsUs, cardsKo] = await Promise.all([
    crawlPages('us', mapEntries, parseMapPage, log),
    crawlPages('kr', mapEntries, parseMapPage, log),
    crawlPages('us', cardEntries, parseCardPage, log),
    crawlPages('kr', cardEntries, parseCardPage, log),
  ]);

  const maps: MapInfo[] = [...mapsUs.values()].map((m) => {
    const ko = mapsKo.get(m.slug);
    return {
      ...m,
      nameKo: areaNameKo.get(m.slug) ?? null,
      bossKo: ko?.boss ?? null,
      tilesetKo: ko?.tileset ?? null,
      linkedKo: ko?.linked ?? [],
    };
  });

  const cards: CardInfo[] = [...cardsUs.values()].map((c) => {
    const ko = cardsKo.get(c.slug);
    return {
      ...c,
      nameKo: cardNameKo.get(c.slug) ?? null,
      rewardKo: ko?.reward ?? null,
      flavourTextKo: ko?.flavourText ?? null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    patchNote: 'PoEDB 최신 패치 데이터 기준',
    areas,
    maps,
    cards,
  };
}
