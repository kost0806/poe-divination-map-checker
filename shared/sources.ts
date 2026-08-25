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
import type {
  CardInfo,
  LeagueInfo,
  MapInfo,
  PriceData,
  ScryingData,
  ScryingPrice,
  StaticData,
  CardWeight,
  WeightData,
} from './types.js';

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

/**
 * 지도별 예지의 오브 시세 (poe.ninja).
 *
 * poe.ninja API 문서가 지원 대상으로 명시한 economy 엔드포인트만 사용한다.
 * 문서의 이용 지침에 따라 서버 쪽에서만 호출하고, 응답 캐시를 존중하며(약 5분),
 * 원본 데이터가 15분 주기로 갱신되므로 그보다 자주 조회하지 않는다.
 * 예지의 오브는 화폐 거래소에서 거래되지 않아 PoEDB 시세에는 존재하지 않는다.
 */
export async function fetchScryingOrbs(league: string, maps: MapInfo[]): Promise<ScryingData> {
  const url = `https://poe.ninja/poe1/api/economy/stash/current/item/overview?league=${encodeURIComponent(league)}&type=ScryingOrb`;
  const body = await fetchJson<{ lines?: ScryingLine[] }>(url);

  // poe.ninja 는 지도명에서 " Map" 을 뗀 이름을 쓴다
  const slugByName = new Map(
    maps.map((m) => [m.name.replace(/\s+Map$/, ''), m.slug] as const),
  );
  const prices: ScryingPrice[] = (body.lines ?? [])
    .filter((line) => line.chaosValue > 0)
    .map((line) => ({
      name: line.name,
      mapSlug: slugByName.get(line.name) ?? null,
      chaos: line.chaosValue,
      divine: line.divineValue ?? 0,
      listings: line.listingCount ?? line.count ?? 0,
      detailsId: line.detailsId ?? '',
    }));
  return { fetchedAt: new Date().toISOString(), league, prices };
}

interface ScryingLine {
  name: string;
  chaosValue: number;
  divineValue?: number;
  count?: number;
  listingCount?: number;
  detailsId?: string;
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
  log('카드별 실측 가중치 조회 중...');
  const weights = await fetchCardWeights().catch((err) => {
    log(`  ! 가중치 표 조회 실패: ${String(err)}`);
    return null;
  });
  if (weights) {
    const measured = weights.cards.filter((c) => c.source === 'measured').length;
    log(`  카드 ${weights.cards.length}종 (실측 ${measured}종), 표본 ${weights.totalSamples.toLocaleString('ko-KR')}개 개봉`);
  }

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
    weights,
  };
}

/* ------------------------------------------------------------------ *
 * 카드별 드롭 가중치 (Divcord 커뮤니티 실측)
 * ------------------------------------------------------------------ */

/** 가중치 표가 있는 공개 스프레드시트 (divicards 프로젝트가 공개한 것) */
const WEIGHT_SHEET_ID = '1PmGES_e1on6K7O5ghHuoorEjruAVb7dQ5m7PGrW7t80';
const WEIGHT_SHEET_GID = '272334906';
/** 표본이 충분히 쌓인 패치들만 집계한다 */
const WEIGHT_PATCHES = ['3.22', '3.23', '3.24', '3.25', '3.26', '3.27', '3.28'];

/** 따옴표를 처리하는 최소 CSV 파서 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * 스택된 덱 개봉 표본으로 만든 카드별 가중치를 가져온다.
 *
 * 표본이 0 인 카드는 검출 상한(3Σw/N)과 골드 회귀 추정치 중 작은 값을 쓰고,
 * 표에 아예 없는 신규 카드는 골드 회귀로 채운다.
 */
export async function fetchCardWeights(): Promise<WeightData> {
  const csv = await fetchText(
    `https://docs.google.com/spreadsheets/d/${WEIGHT_SHEET_ID}/export?format=csv&gid=${WEIGHT_SHEET_GID}`,
  );
  const rows = parseCsv(csv);
  const header = rows[0];
  const index = new Map(header.map((name, i) => [name.trim(), i]));
  const sizes = rows[1];
  const sampleSize = new Map(
    WEIGHT_PATCHES.map((p) => [p, Number(sizes[index.get(p) ?? -1] ?? 0) || 0]),
  );
  const totalSamples = [...sampleSize.values()].reduce((a, b) => a + b, 0);

  interface Raw {
    name: string;
    bucket: number | null;
    gold: number | null;
    bossOnly: boolean;
    weight: number | null;
  }
  const raw: Raw[] = [];
  for (const row of rows.slice(2)) {
    const name = (row[0] ?? '').trim();
    if (!name) continue;
    let num = 0;
    let den = 0;
    for (const patch of WEIGHT_PATCHES) {
      const value = (row[index.get(patch) ?? -1] ?? '').trim();
      if (value === '') continue;
      const size = sampleSize.get(patch) ?? 0;
      num += Number(value) * size;
      den += size;
    }
    const bucket = Number((row[1] ?? '').trim());
    const gold = Number((row[2] ?? '').trim());
    raw.push({
      name,
      bucket: Number.isFinite(bucket) && (row[1] ?? '').trim() !== '' ? bucket : null,
      gold: Number.isFinite(gold) && (row[2] ?? '').trim() !== '' ? gold : null,
      bossOnly: (row[3] ?? '').trim() === 'Boss',
      weight: den > 0 ? num / den : null,
    });
  }

  const totalWeight = raw.reduce((a, r) => a + (r.weight ?? 0), 0);
  // 표본 0 이면 관측 확률의 95% 상한이 3/N 이므로 가중치는 3Σw/N 미만이다
  const detectionBound = totalSamples > 0 ? (3 * totalWeight) / totalSamples : 0;

  // 신규 카드용 골드→가중치 회귀 (보스 전용과 미실측은 제외)
  const fitPoints = raw.filter((r) => !r.bossOnly && r.weight && r.weight > 0 && r.gold && r.gold > 0);
  const lx = fitPoints.map((r) => Math.log(r.gold!));
  const ly = fitPoints.map((r) => Math.log(r.weight!));
  const mx = lx.reduce((a, b) => a + b, 0) / lx.length;
  const my = ly.reduce((a, b) => a + b, 0) / ly.length;
  const sxy = lx.reduce((a, x, i) => a + (x - mx) * (ly[i] - my), 0);
  const sxx = lx.reduce((a, x) => a + (x - mx) ** 2, 0);
  const syy = ly.reduce((a, y) => a + (y - my) ** 2, 0);
  const exponent = sxy / sxx;
  const intercept = my - exponent * mx;
  const goldFit = {
    exponent,
    intercept,
    r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 0,
    samples: fitPoints.length,
  };
  const fromGold = (gold: number) => Math.exp(intercept + exponent * Math.log(gold));

  const cards: CardWeight[] = raw.map((r) => {
    if (r.weight && r.weight > 0) {
      return { name: r.name, weight: r.weight, source: 'measured', bucket: r.bucket, bossOnly: r.bossOnly };
    }
    // 표본이 0 이라는 사실 자체가 상한을 준다. 골드 추정치와 상한 중 작은 쪽을 쓴다
    const guess = r.gold ? Math.min(fromGold(r.gold), detectionBound) : detectionBound;
    return { name: r.name, weight: guess, source: 'bucket', bucket: r.bucket, bossOnly: r.bossOnly };
  });

  return {
    fetchedAt: new Date().toISOString(),
    patches: WEIGHT_PATCHES,
    totalSamples,
    detectionBound,
    goldFit,
    cards,
  };
}
