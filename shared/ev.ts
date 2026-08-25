/**
 * 지도별 점술 카드 기대 수익 모델.
 *
 * ── 근거와 한계 ──────────────────────────────────────────────────────
 * GGG는 카드별 드롭 확률을 공개하지 않는다. 게임 데이터(dat) 1535개 테이블에도
 * 카드 단위 가중치는 없고, 거래량으로 역산하는 것도 불가능하다 —
 * `거래량 = 드롭률 × Σ(그 카드가 나오는 지도들의 실행 횟수)` 라서 지도 인기도와
 * 드롭률이 분리되지 않는다(미지수가 방정식보다 많아 식별 불가).
 *
 * 대신 화폐 거래소 골드 수수료(CurrencyExchange.GoldPurchaseFee)를 쓴다.
 * GGG가 아이템마다 직접 매긴 정적 값이라 시장 시세·지도 인기도와 무관하다.
 * 한 지도에서만 드롭되는 카드들끼리는 그 지도의 실행 횟수가 약분되므로 거래량 비율이
 * 상대 드롭률의 불편추정치가 되는데, 이걸로 검증하면
 * `log(거래량) ~ log(골드)` 기울기가 -1.005로 드롭률이 골드에 반비례한다.
 *
 * 따라서 카드 c의 절대 드롭률을 `A · gold_c^(-γ)` 로 둔다. A는 모든 지도에 동일하게
 * 곱해지는 전역 상수이므로 지도 간 순위에는 영향이 없고, 절대 수익 환산에만 쓰인다.
 *
 * 지역 제한 없이 아무 데서나 드롭되는 전역 풀 카드는 모든 지도에 공통이므로 제외하고,
 * 지도 전용 카드만 비교한다.
 */
import type {
  AreaPool,
  Calibration,
  CardInfo,
  MapInfo,
  PriceEntry,
  ScryingPrice,
} from './types.js';

export interface EvParams {
  /**
   * 실행 지역 레벨 가정.
   * - 'voidstone': 공허석 4개를 낀 상태. 아틀라스 전체가 16등급(지역 레벨 83)이 되고,
   *   17등급 지도는 원래 레벨(84)을 유지한다.
   * - 'base': 공허석 없이 각 지도 고유 등급
   * - 숫자: 해당 등급으로 돌린다고 가정
   */
  tierMode: 'voidstone' | 'base' | number;
  /** 상대 드롭률의 근거 */
  weightSource: 'gold' | 'uniform' | 'volume';
  /** 희소성 지수 γ. 드롭률 ∝ 골드^(-γ) */
  gamma: number;
  /** 평균적인 지도 1회당 전용 카드 드롭 기대 개수 (절대 수익 환산 스케일) */
  cardsPerRun: number;
  /** 몬스터 밀도(Mob Count)로 드롭량 보정 */
  scaleByDensity: boolean;
  /** 기준 지도 1회 소요 시간(분) */
  minutesPerRun: number;
  /** 클리어 지표(Clearing Ability)로 소요 시간 보정 */
  scaleTimeByClearing: boolean;
  /** 시세를 못 찾은 카드에 적용할 값(카오스) */
  priceFloorChaos: number;
}

/** 희소성 지수 조절 범위. 실측 관측치(천벌 2700판에 1장 등)가 2 부근이라 넉넉히 잡는다 */
export const GAMMA_BOUNDS = { min: 0.3, max: 5 };

/** 공허석 4개를 모두 장착하면 아틀라스 전체가 16등급이 된다 */
export const VOIDSTONE_TIER = 16;

/** 쉐이퍼 수호자 지도는 아틀라스 대신 쉐이퍼의 영역과 이어져 있다 */
const SHAPER_REALM = "The Shaper's Realm";

/**
 * 선호 지도로 예지할 수 있는 지도인지 판정한다. 아틀라스에 올라 있는 일반 지도만 남긴다.
 * 제외 대상:
 * - 17등급 지도
 * - map_not_on_atlas 태그 (자나 기억으로만 들어가는 거짓의 극장 등)
 * - 쉐이퍼 수호자 지도 (키메라의 구덩이·히드라의 소굴·미노타우로스의 미로·불사조의 대장간).
 *   아틀라스 연결이 다른 지도가 아니라 쉐이퍼의 영역으로 되어 있는 것으로 구분한다
 * - 바알 사원 지도 (바알 피라미드 지도를 타락시켜야 나온다)
 * 고유 지도는 애초에 지역 목록에서 지도로 분류되지 않아 들어오지 않는다.
 *
 * 지도 아이템에 붙는 인챈트(예: "지도가 태초자의 영향을 받음")는 지도 베이스가 아니므로
 * 목록에 영향을 주지 않는다. 카드 풀은 지도 베이스 단위로만 정의된다. 엘더 수호자도 마찬가지로
 * 일반 지도에 영향력이 걸려 등장할 뿐 별도 지도 베이스가 아니다.
 */
export function isFavourable(map: MapInfo): boolean {
  if (map.tier > VOIDSTONE_TIER) return false;
  if (map.tags.includes('map_not_on_atlas')) return false;
  if (map.tags.includes('vaal_pyramid_area')) return false;
  if (map.linked.includes(SHAPER_REALM)) return false;
  return true;
}

export const DEFAULT_PARAMS: EvParams = {
  tierMode: 'voidstone',
  weightSource: 'gold',
  gamma: 1,
  cardsPerRun: 0.3,
  scaleByDensity: true,
  minutesPerRun: 4,
  scaleTimeByClearing: true,
  priceFloorChaos: 0,
};

export interface CardRow {
  card: string;
  /** 공식 한국어 카드명 */
  cardKo: string | null;
  /** PoEDB 문서 슬러그 */
  slug: string | null;
  /** 드롭에 필요한 지역 레벨 */
  requiredLevel: number;
  chaos: number;
  /** 시세 조회 실패 (하한값 사용) */
  noPrice: boolean;
  goldFee: number | null;
  volume: number;
  stackSize: number | null;
  reward: string | null;
  rewardKo: string | null;
  /** 이 카드가 드롭되는 지역 수 */
  areaCount: number;
  /** 상대 드롭률 가중치 gold^(-γ) */
  weight: number;
  /** 지도 1회당 드롭 기대 개수 */
  dropsPerRun: number;
  /** 몇 회 실행당 1장 꼴인지 (체감 검증용) */
  runsPerDrop: number;
  /** 지도 1회당 기대 기여 수익(카오스) */
  contribution: number;
  /** 이 지도 기대 수익에서 차지하는 비중 */
  share: number;
}

export interface MapEv {
  map: MapInfo;
  effectiveAreaLevel: number;
  /** 드롭 레벨 조건을 통과한 전용 카드 수 */
  poolSize: number;
  /** 지역 레벨이 낮아 드롭되지 않는 카드 */
  locked: {
    card: string;
    cardKo: string | null;
    slug: string | null;
    requiredLevel: number;
    chaos: number;
  }[];
  /** 상대 드롭량 Σ gold^(-γ) */
  relativeDrops: number;
  /** 상대 기대 수익 Σ gold^(-γ) × 시세 — 지도 간 순위의 기준값 */
  relativeValue: number;
  /** 지도 1회당 전용 카드 드롭 기대 개수 */
  cardsPerRun: number;
  /** 지도 1회당 기대 수익(카오스) */
  evPerRun: number;
  /** 시간당 기대 수익(카오스) */
  evPerHour: number;
  /** 지도 1회 예상 소요 시간(분) */
  minutesPerRun: number;
  /** 전용 카드 1장당 평균 가치(카오스) */
  valuePerCard: number;
  /** 이 지도를 예지하는 예지의 오브 시세(카오스) */
  scryingChaos: number | null;
  /** 예지 비용을 회수하는 데 필요한 실행 횟수 */
  paybackRuns: number | null;
  /** 회수까지 걸리는 시간(분) */
  paybackMinutes: number | null;
  topCard: CardRow | null;
  cards: CardRow[];
}

export interface EvInput {
  areas: AreaPool[];
  maps: MapInfo[];
  cards: CardInfo[];
  prices: PriceEntry[];
  /** 지도별 예지의 오브 시세. 없으면 회수 판수를 계산하지 않는다 */
  scrying?: ScryingPrice[];
}

/** 이름 표기 차이를 흡수하는 정규화 키 */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface Index {
  price: Map<string, PriceEntry>;
  scrying: Map<string, ScryingPrice>;
  card: Map<string, CardInfo>;
  map: Map<string, MapInfo>;
  areaCount: Map<string, number>;
  /** 골드값이 없는 카드에 쓸 중앙값 */
  medianGold: number;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function buildIndex(input: EvInput): Index {
  const price = new Map<string, PriceEntry>();
  for (const p of input.prices) price.set(normalizeName(p.name), p);

  const card = new Map<string, CardInfo>();
  for (const c of input.cards) {
    card.set(normalizeName(c.name), c);
    // NoteCode 는 화폐 거래소 슬러그와 같아, 이름 표기가 어긋날 때 대안 키가 된다
    if (c.noteCode && !price.has(normalizeName(c.name))) {
      const byNote = input.prices.find((p) => p.slug === c.noteCode);
      if (byNote) price.set(normalizeName(c.name), byNote);
    }
  }

  const map = new Map<string, MapInfo>();
  for (const m of input.maps) map.set(m.slug, m);

  const areaCount = new Map<string, number>();
  for (const area of input.areas) {
    for (const entry of area.cards) {
      const key = normalizeName(entry.card);
      areaCount.set(key, (areaCount.get(key) ?? 0) + 1);
    }
  }

  return {
    price,
    card,
    map,
    scrying: new Map((input.scrying ?? []).flatMap((s) => (s.mapSlug ? [[s.mapSlug, s] as const] : []))),
    areaCount,
    medianGold: median(input.cards.map((c) => c.goldFee ?? 0).filter((g) => g > 0)),
  };
}

/** 등급 → 지역 레벨. 데이터에 있는 실제 지도들의 값에서 만든다 */
export function tierLevels(maps: MapInfo[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const m of maps) {
    if (m.tier > 0 && m.areaLevel > 0) out.set(m.tier, Math.max(out.get(m.tier) ?? 0, m.areaLevel));
  }
  return out;
}

/** 등급 가정을 실제 지역 레벨로 환산한다 */
export function effectiveAreaLevel(
  map: MapInfo,
  tierMode: EvParams['tierMode'],
  tierLevel: Map<number, number>,
): number {
  const levelOf = (tier: number) => tierLevel.get(tier) ?? 67 + tier;
  if (tierMode === 'base') return map.areaLevel;
  // 공허석은 지도 등급을 끌어올릴 뿐 낮추지는 않으므로 원래 레벨이 더 높으면 그대로 둔다
  if (tierMode === 'voidstone') return Math.max(map.areaLevel, levelOf(VOIDSTONE_TIER));
  return levelOf(tierMode);
}

interface Refs {
  avgMobCount: number;
  avgClearing: number;
  /** 전체 지도 평균 상대 드롭량. 절대 개수 환산의 기준 */
  avgRelativeDrops: number;
  tierLevel: Map<number, number>;
}

function weightOf(
  source: EvParams['weightSource'],
  gamma: number,
  gold: number,
  volume: number,
  areaCount: number,
): number {
  if (source === 'uniform') return 1;
  if (source === 'volume') return volume / Math.max(areaCount, 1);
  return Math.pow(Math.max(gold, 1), -gamma);
}

function rowsFor(area: AreaPool, index: Index, areaLevel: number) {
  const eligible: {
    entry: { card: string; minTier: number };
    info: CardInfo | undefined;
    price: PriceEntry | undefined;
    requiredLevel: number;
  }[] = [];
  const locked: MapEv['locked'] = [];

  for (const entry of area.cards) {
    const key = normalizeName(entry.card);
    const info = index.card.get(key);
    const price = index.price.get(key);
    // PoEDB의 "tier N+" 표기는 카드 DropLevel에서 유도된 값이므로 원본인 DropLevel을 쓴다
    const requiredLevel = info?.dropLevel ?? entry.minTier + 68;
    if (requiredLevel > areaLevel) {
      locked.push({
        card: entry.card,
        cardKo: info?.nameKo ?? null,
        slug: info?.slug ?? null,
        requiredLevel,
        chaos: price?.chaos ?? 0,
      });
      continue;
    }
    eligible.push({ entry, info, price, requiredLevel });
  }
  return { eligible, locked };
}

export function computeMapEv(
  area: AreaPool,
  map: MapInfo,
  index: Index,
  params: EvParams,
  refs: Refs,
): MapEv {
  const areaLevel = effectiveAreaLevel(map, params.tierMode, refs.tierLevel);
  const { eligible, locked } = rowsFor(area, index, areaLevel);

  const base = eligible.map((e) => {
    const key = normalizeName(e.entry.card);
    const gold = e.info?.goldFee ?? index.medianGold;
    const volume = e.price?.volume ?? 0;
    const areaCount = index.areaCount.get(key) ?? 1;
    return {
      card: e.entry.card,
      cardKo: e.info?.nameKo ?? null,
      slug: e.info?.slug ?? null,
      requiredLevel: e.requiredLevel,
      chaos: e.price ? e.price.chaos : params.priceFloorChaos,
      noPrice: !e.price,
      goldFee: e.info?.goldFee ?? null,
      volume,
      stackSize: e.info?.stackSize ?? null,
      reward: e.info?.reward ?? null,
      rewardKo: e.info?.rewardKo ?? null,
      areaCount,
      weight: weightOf(params.weightSource, params.gamma, gold, volume, areaCount),
    };
  });

  const relativeDrops = base.reduce((a, c) => a + c.weight, 0);
  const relativeValue = base.reduce((a, c) => a + c.weight * c.chaos, 0);

  // 전역 상수 A: "평균적인 지도 1회당 전용 카드 cardsPerRun장" 이 되도록 스케일을 맞춘다.
  // 모든 지도에 동일하게 곱해지므로 순위에는 영향이 없다.
  const scale = refs.avgRelativeDrops > 0 ? params.cardsPerRun / refs.avgRelativeDrops : 0;
  const density =
    params.scaleByDensity && map.mobCount && refs.avgMobCount > 0
      ? map.mobCount / refs.avgMobCount
      : 1;
  const speed =
    params.scaleTimeByClearing && map.clearingAbility && refs.avgClearing > 0
      ? refs.avgClearing / map.clearingAbility
      : 1;

  const cardsPerRun = relativeDrops * scale * density;
  const evPerRun = relativeValue * scale * density;
  const minutesPerRun = params.minutesPerRun * speed;
  // 예지 비용을 지도 1회당 기대 수익으로 나누면 본전까지 필요한 판수가 된다
  const scryingChaos = index.scrying.get(map.slug)?.chaos ?? null;
  const paybackRuns = scryingChaos !== null && evPerRun > 0 ? scryingChaos / evPerRun : null;

  const cards: CardRow[] = base
    .map((c) => {
      const dropsPerRun = c.weight * scale * density;
      const contribution = dropsPerRun * c.chaos;
      return {
        ...c,
        dropsPerRun,
        runsPerDrop: dropsPerRun > 0 ? 1 / dropsPerRun : Infinity,
        contribution,
        share: evPerRun > 0 ? contribution / evPerRun : 0,
      };
    })
    .sort((a, b) => b.contribution - a.contribution);

  return {
    map,
    effectiveAreaLevel: areaLevel,
    poolSize: cards.length,
    locked,
    relativeDrops,
    relativeValue,
    cardsPerRun,
    evPerRun,
    evPerHour: minutesPerRun > 0 ? (evPerRun * 60) / minutesPerRun : 0,
    minutesPerRun,
    valuePerCard: relativeDrops > 0 ? relativeValue / relativeDrops : 0,
    scryingChaos,
    paybackRuns,
    paybackMinutes: paybackRuns !== null ? paybackRuns * minutesPerRun : null,
    topCard: cards.reduce<CardRow | null>((best, r) => (!best || r.chaos > best.chaos ? r : best), null),
    cards,
  };
}

export function computeAll(input: EvInput, params: EvParams): MapEv[] {
  const index = buildIndex(input);
  const tierLevel = tierLevels(input.maps);

  // 스케일 기준이 되는 평균 상대 드롭량은 파라미터에 따라 달라지므로 매번 다시 구한다
  const mapAreas = input.areas.filter((a) => {
    const map = index.map.get(a.slug);
    return a.isMap && map !== undefined && isFavourable(map);
  });
  const rawDrops = mapAreas.map((area) => {
    const map = index.map.get(area.slug)!;
    const { eligible } = rowsFor(area, index, effectiveAreaLevel(map, params.tierMode, tierLevel));
    return eligible.reduce((acc, e) => {
      const key = normalizeName(e.entry.card);
      return (
        acc +
        weightOf(
          params.weightSource,
          params.gamma,
          e.info?.goldFee ?? index.medianGold,
          e.price?.volume ?? 0,
          index.areaCount.get(key) ?? 1,
        )
      );
    }, 0);
  });

  const refs: Refs = {
    avgMobCount: mean(input.maps.map((m) => m.mobCount ?? 0).filter((v) => v > 0)),
    avgClearing: mean(input.maps.map((m) => m.clearingAbility ?? 0).filter((v) => v > 0)),
    avgRelativeDrops: mean(rawDrops.filter((v) => v > 0)),
    tierLevel,
  };

  const out = mapAreas.map((area) => computeMapEv(area, index.map.get(area.slug)!, index, params, refs));
  out.sort((a, b) => b.evPerRun - a.evPerRun);
  return out;
}

/* ------------------------------------------------------------------ *
 * 희소성 지수 γ 실측
 * ------------------------------------------------------------------ */

/**
 * 한 지도에서만 드롭되는 카드들끼리는 그 지도의 실행 횟수가 공통이라 약분되므로,
 * 이들의 거래량 비율은 상대 드롭률의 불편추정치다. 지도별로 중심화한 뒤
 * log(거래량) ~ log(골드) 회귀 기울기를 모으면 γ = -기울기 를 얻는다.
 *
 * 주의: 거래량이 0인 카드는 회귀에서 빠지는데 그런 카드는 대개 흔한 저가 카드다.
 * 즉 표본이 희귀 카드 쪽으로 잘려 γ는 과소추정되는 방향으로 편향된다(실제 γ ≥ 추정치).
 */
export function calibrateGamma(input: EvInput, minVolume = 1): Calibration | null {
  const index = buildIndex(input);
  const points: Calibration['points'] = [];
  const centered: { x: number; y: number }[] = [];
  const maps = new Set<string>();

  for (const area of input.areas) {
    if (!area.isMap) continue;
    const exclusive = area.cards
      .map((entry) => {
        const key = normalizeName(entry.card);
        return {
          card: entry.card,
          gold: index.card.get(key)?.goldFee ?? 0,
          volume: index.price.get(key)?.volume ?? 0,
          chaos: index.price.get(key)?.chaos ?? 0,
          areaCount: index.areaCount.get(key) ?? 1,
        };
      })
      .filter((c) => c.areaCount === 1 && c.gold > 0 && c.volume >= minVolume);
    if (exclusive.length < 2) continue;

    maps.add(area.name);
    const lx = exclusive.map((c) => Math.log(c.gold));
    const ly = exclusive.map((c) => Math.log(c.volume));
    const mx = mean(lx);
    const my = mean(ly);
    exclusive.forEach((c, i) => {
      centered.push({ x: lx[i] - mx, y: ly[i] - my });
      points.push({ card: c.card, map: area.name, gold: c.gold, chaos: c.chaos, volume: c.volume });
    });
  }

  if (centered.length < 3) return null;
  const sxy = centered.reduce((a, p) => a + p.x * p.y, 0);
  const sxx = centered.reduce((a, p) => a + p.x * p.x, 0);
  const syy = centered.reduce((a, p) => a + p.y * p.y, 0);
  if (!(sxx > 0)) return null;

  return {
    gamma: -(sxy / sxx),
    r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 0,
    samples: centered.length,
    maps: maps.size,
    minVolume,
    points,
  };
}

/* ------------------------------------------------------------------ *
 * 실측 관측으로 파라미터 역산
 * ------------------------------------------------------------------ */

/** 특정 지도에서 특정 카드가 실제로 나온 빈도를 재현하는 γ를 찾는다 */
export function solveGamma(
  input: EvInput,
  params: EvParams,
  mapSlug: string,
  card: string,
  targetDropsPerRun: number,
  bounds: { min: number; max: number },
): number | null {
  if (!(targetDropsPerRun > 0)) return null;

  const rateAt = (gamma: number): number | null => {
    const rows = computeAll(input, { ...params, gamma });
    const row = rows.find((r) => r.map.slug === mapSlug);
    return row?.cards.find((c) => c.card === card)?.dropsPerRun ?? null;
  };

  const low = rateAt(bounds.min);
  const high = rateAt(bounds.max);
  if (low === null || high === null) return null;
  // 흔한 카드는 γ가 커질수록 오히려 비중이 늘어 방향이 뒤집히므로 양쪽 모두 처리한다
  const decreasing = high < low;
  const reachable = decreasing
    ? targetDropsPerRun <= low && targetDropsPerRun >= high
    : targetDropsPerRun >= low && targetDropsPerRun <= high;
  if (!reachable) return null;

  let min = bounds.min;
  let max = bounds.max;
  for (let i = 0; i < 60; i++) {
    const mid = (min + max) / 2;
    const rate = rateAt(mid);
    if (rate === null) return null;
    if (decreasing ? rate > targetDropsPerRun : rate < targetDropsPerRun) min = mid;
    else max = mid;
  }
  return (min + max) / 2;
}
