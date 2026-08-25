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
  CardInfo,
  MapInfo,
  CardWeight,
  PriceEntry,
  ScryingPrice,
  WeightData,
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
  /**
   * 상대 드롭률의 근거.
   * - 'measured': Divcord 커뮤니티가 스택된 덱 개봉으로 실측한 가중치 (기본값)
   * - 'gold': 골드 수수료 기반 추정
   * - 'uniform': 비교용
   */
  weightSource: 'measured' | 'gold' | 'uniform';
  /** 골드 기반 추정을 쓸 때의 희소성 지수 */
  gamma: number;
  /** 지도 1판에 점술 카드가 몇 장 떨어진다고 볼지 */
  dropsPerMap: number;

  /**
   * 실측으로 고정한 카드별 드롭 횟수. 키는 `지도슬러그|카드영문명`, 값은 지도 1판당 기대 개수.
   * 공식이 맞지 않는 카드를 직접 관측값으로 덮어쓴다.
   */
  pinnedRates: Record<string, number>;
  /** 시세를 못 찾은 카드에 적용할 값(카오스) */
  priceFloorChaos: number;
}

/** 희소성 지수 조절 범위 */
export const GAMMA_BOUNDS = { min: 0.3, max: 5 };

/**
 * 보스 전용 카드의 지도 1판당 드롭 기회.
 * 보스는 판당 한 번만 잡으므로 일반 몬스터 드롭 수와 무관하게 한 번으로 고정한다.
 */
export const BOSS_DROPS_PER_MAP = 1;

/** 공허석 4개를 모두 장착하면 아틀라스 전체가 16등급이 된다 */
export const VOIDSTONE_TIER = 16;

/** 쉐이퍼 수호자 지도는 아틀라스 대신 쉐이퍼의 영역과 이어져 있다 */
const SHAPER_REALM = "The Shaper's Realm";

/**
 * 선호 지도로 예지할 수 있는 지도인지 판정한다. 아틀라스에 올라 있는 일반 지도만 남긴다.
 * 제외 대상: 17등급 지도, map_not_on_atlas 태그(자나 기억으로만 들어가는 지도),
 * 쉐이퍼 수호자 지도(아틀라스 연결이 쉐이퍼의 영역), 바알 사원 지도(바알 피라미드를 타락시켜야 나옴).
 * 고유 지도는 애초에 지역 목록에서 지도로 분류되지 않아 들어오지 않는다.
 *
 * 지도 아이템 인챈트("지도가 태초자의 영향을 받음" 등)는 지도 베이스가 아니라 카드 풀을
 * 바꾸지 않으므로 목록에 영향을 주지 않는다.
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
  weightSource: 'measured',
  gamma: 2.35,
  dropsPerMap: 1,
  pinnedRates: {},
  priceFloorChaos: 0,
};

export interface CardRow {
  card: string;
  cardKo: string | null;
  slug: string | null;
  /** 드롭에 필요한 지역 레벨 */
  requiredLevel: number;
  chaos: number;
  /** 시세 조회 실패 */
  noPrice: boolean;
  goldFee: number | null;
  volume: number;
  stackSize: number | null;
  reward: string | null;
  rewardKo: string | null;
  /** 이 카드가 드롭되는 지역 수 */
  areaCount: number;
  /** 커뮤니티 실측 가중치 정보 */
  measured: CardWeight | undefined;
  /** 카드가 드롭됐을 때 이 카드일 확률 */
  probability: number;
  /** 지도 1판당 이 카드가 나올 기대 개수 */
  dropsPerMap: number;
  /** 몇 판에 1장 꼴인지 */
  mapsPerDrop: number;
  /** 지표 기여분 (기대 개수 × 시세) */
  contribution: number;
  /** 이 지도 지표에서 차지하는 비중 */
  share: number;
  /** 사용자가 관측값으로 고정한 카드인지 */
  pinned: boolean;
  /** 보스에서만 나오는 카드인지 */
  bossOnly: boolean;
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
  /**
   * 지도 비교 지표. Σ (지도 1판당 기대 개수 × 시세).
   * 지도 1판당 카드 드롭 횟수를 기준값으로 고정했으므로 절대 수익이 아니라 비교용 지수다.
   */
  index: number;
  /** 이 지도를 예지하는 예지의 오브 시세(카오스) */
  scryingChaos: number | null;
  /** 예지 비용 ÷ 지표. 작을수록 빨리 회수된다 */
  paybackIndex: number | null;
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
  /** 카드별 실측 드롭 가중치 */
  weights?: WeightData | null;
}

/** 이름 표기 차이를 흡수하는 정규화 키 */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface Index {
  price: Map<string, PriceEntry>;
  scrying: Map<string, ScryingPrice>;
  weight: Map<string, CardWeight>;
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
    weight: new Map((input.weights?.cards ?? []).map((w) => [normalizeName(w.name), w])),
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
  /** 지역 제한이 없어 어디서나 후보가 되는 카드들의 가중치 합 */
  globalPoolWeight: number;
  tierLevel: Map<number, number>;
}

function weightOf(params: EvParams, gold: number, measured: CardWeight | undefined): number {
  if (params.weightSource === 'uniform') return 1;
  if (params.weightSource === 'gold') return Math.pow(Math.max(gold, 1), -params.gamma);
  // 실측 가중치가 없는 카드만 골드 추정으로 넘어간다
  return measured ? measured.weight : Math.pow(Math.max(gold, 1), -params.gamma);
}

/** 실측 고정 키 */
export function pinKey(mapSlug: string, card: string): string {
  return `${mapSlug}|${card}`;
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

  const weights = eligible.map((e) =>
    weightOf(params, e.info?.goldFee ?? index.medianGold, index.weight.get(normalizeName(e.entry.card))),
  );
  // 이 지역에서 카드가 드롭될 때의 후보 풀.
  // 지역 제한이 없는 카드는 어디서나 후보이므로 반드시 분모에 들어간다. 지도 전용 카드만으로
  // 분모를 잡으면 전용 카드가 전부 희귀한 지도(상점가는 4장 합이 34)에서 확률이 터무니없어진다.
  const poolWeight = weights.reduce((a, w) => a + w, 0) + refs.globalPoolWeight;

  const rows = eligible.map((e, i) => {
    const key = normalizeName(e.entry.card);
    const measured = index.weight.get(key);
    const weight = weights[i];
    // 카드가 드롭됐을 때 이 카드일 확률
    const probability = poolWeight > 0 ? weight / poolWeight : 0;
    const bossOnly = measured?.bossOnly ?? false;
    // 보스 카드는 판당 한 번인 보스 처치에서만 기회가 생기므로 드롭 수 슬라이더와 무관하다
    const chances = bossOnly ? BOSS_DROPS_PER_MAP : params.dropsPerMap;
    const pinnedRate = params.pinnedRates[pinKey(map.slug, e.entry.card)];
    const dropsPerMap = pinnedRate !== undefined ? pinnedRate : chances * probability;
    const chaos = e.price ? e.price.chaos : params.priceFloorChaos;

    return {
      card: e.entry.card,
      cardKo: e.info?.nameKo ?? null,
      slug: e.info?.slug ?? null,
      requiredLevel: e.requiredLevel,
      chaos,
      noPrice: !e.price,
      goldFee: e.info?.goldFee ?? null,
      volume: e.price?.volume ?? 0,
      stackSize: e.info?.stackSize ?? null,
      reward: e.info?.reward ?? null,
      rewardKo: e.info?.rewardKo ?? null,
      areaCount: index.areaCount.get(key) ?? 1,
      measured,
      probability,
      dropsPerMap,
      mapsPerDrop: dropsPerMap > 0 ? 1 / dropsPerMap : Infinity,
      contribution: dropsPerMap * chaos,
      pinned: pinnedRate !== undefined,
      bossOnly,
    };
  });
  rows.sort((a, b) => b.contribution - a.contribution);

  const total = rows.reduce((a, r) => a + r.contribution, 0);
  const cards: CardRow[] = rows.map((r) => ({
    ...r,
    share: total > 0 ? r.contribution / total : 0,
  }));

  const scryingChaos = index.scrying.get(map.slug)?.chaos ?? null;

  return {
    map,
    effectiveAreaLevel: areaLevel,
    poolSize: cards.length,
    locked,
    index: total,
    scryingChaos,
    paybackIndex: scryingChaos !== null && total > 0 ? scryingChaos / total : null,
    topCard: cards.reduce<CardRow | null>((best, r) => (!best || r.chaos > best.chaos ? r : best), null),
    cards,
  };
}

export function computeAll(input: EvInput, params: EvParams): MapEv[] {
  const index = buildIndex(input);
  const tierLevel = tierLevels(input.maps);

  // 지역 제한이 없는 카드 = 어느 지역의 카드 목록에도 없는 카드
  const restricted = new Set(
    input.areas.flatMap((a) => a.cards.map((c) => normalizeName(c.card))),
  );
  const globalPoolWeight = (input.weights?.cards ?? [])
    .filter((c) => !restricted.has(normalizeName(c.name)))
    .reduce((a, c) => a + weightOf(params, c.gold ?? index.medianGold, c), 0);

  const refs: Refs = { globalPoolWeight, tierLevel };
  const out = input.areas
    .filter((a) => {
      const map = index.map.get(a.slug);
      return a.isMap && map !== undefined && isFavourable(map);
    })
    .map((area) => computeMapEv(area, index.map.get(area.slug)!, index, params, refs));
  out.sort((a, b) => b.index - a.index);
  return out;
}
