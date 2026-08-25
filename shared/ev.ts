/**
 * 맵별 디비네이션 카드 기대수익 모델.
 *
 * ── 왜 이런 구조인가 ────────────────────────────────────────────────
 * GGG는 카드별 드랍 확률을 공개하지 않는다. 게임 클라이언트 데이터(dat)에도
 * 카드 단위 가중치 테이블은 존재하지 않으며(그룹 단위 DropPool만 존재),
 * 거래량으로 역산하려 해도 `거래량 = 드랍률 × Σ(해당 맵들의 실행 횟수)` 라
 * 맵 인기도와 드랍률이 분리되지 않는다(미지수가 방정식보다 많아 식별 불가).
 *
 * 따라서 이 모델의 1차 지표는 "맵 1회당 절대 수익"이 아니라
 * **카드 1장이 드랍됐을 때의 기대 가치**(valuePerCard)다. 이 값은 맵 내부의
 * 상대 가중치만 필요하므로 맵 인기도 편향에서 자유롭다. 실행당·시간당 수익은
 * 여기에 "맵 1회당 카드 드랍 수" 가정을 곱해 파생시키며, 그 가정은 파라미터로
 * 노출해 사용자가 직접 조정하게 한다.
 */
import type { AreaPool, Calibration, CardInfo, MapInfo, PriceEntry } from './types';

export interface EvParams {
  /** 'base' = 각 맵의 아틀라스 기본 티어, 숫자 = 해당 티어로 돌린다고 가정 (키락 미션 등) */
  tierMode: 'base' | number;
  /** 맵 내부 기본 가중치 분포 */
  weightModel: 'uniform' | 'rarity';
  /**
   * 풀 크기를 어떻게 다룰지에 대한 가정.
   * - 'perMap': 맵마다 지역 전용 카드 총 드랍 수가 같다고 본다(카드가 적을수록 개별 확률↑)
   * - 'perCard': 카드 하나하나의 드랍률이 독립이라고 본다(풀이 클수록 총 드랍 수↑)
   */
  poolNormalization: 'perMap' | 'perCard';
  /** 희소성 지수 β. 드랍률 ∝ 가격^(-β) */
  beta: number;
  /** 실측 거래량 분포를 섞는 비율 λ (0=모델만, 1=거래량만) */
  supplyBlend: number;
  /** 시세가 없는 카드에 적용할 가격 하한(카오스) */
  priceFloorChaos: number;
  /** 맵 1회당 지역 전용 카드 드랍 기대 개수 */
  cardsPerRun: number;
  /** 몹 밀도(Mob Count)로 드랍 개수를 보정 */
  scaleByDensity: boolean;
  /** 기준 맵 1회 소요 시간(분) */
  minutesPerRun: number;
  /** 클리어 지표(Clearing Ability)로 소요 시간을 보정 */
  scaleTimeByClearing: boolean;
}

export const DEFAULT_PARAMS: EvParams = {
  tierMode: 'base',
  weightModel: 'rarity',
  poolNormalization: 'perMap',
  beta: 0.35,
  supplyBlend: 0.3,
  priceFloorChaos: 1,
  cardsPerRun: 1.5,
  scaleByDensity: true,
  minutesPerRun: 4,
  scaleTimeByClearing: true,
};

export interface CardRow {
  card: string;
  minTier: number;
  /** 드랍에 필요한 지역 레벨 (카드의 DropLevel) */
  requiredLevel: number;
  chaos: number;
  /** 시세 조회에 실패해 하한값을 쓴 카드 */
  estimated: boolean;
  volume: number;
  stackSize: number | null;
  reward: string | null;
  /** 이 맵에서 카드가 드랍될 수 있는 지역 수 (공급 분산 보정용) */
  areaCount: number;
  /** 맵 내부 드랍 확률 추정치 (perMap 가정에서 합 1) */
  q: number;
  /** 맵 1회당 이 카드가 드랍될 기대 개수 */
  dropsPerRun: number;
  /** 맵 1회당 기대 기여 수익 (카오스) */
  contribution: number;
}

export interface MapEv {
  map: MapInfo;
  effectiveTier: number;
  /** 실행 지역 레벨 (티어 가정 반영) */
  effectiveAreaLevel: number;
  /** 드랍 레벨 조건을 통과한 카드 수 */
  poolSize: number;
  /** 지역 레벨이 낮아 잠긴 카드 수 */
  lockedCount: number;
  /** 잠긴 카드 목록 (해금에 필요한 레벨 포함) */
  locked: { card: string; requiredLevel: number; chaos: number }[];
  /** 카드 1장 드랍당 기대가치 (카오스) */
  valuePerCard: number;
  /** 맵 1회당 카드 드랍 기대 개수 */
  cardsPerRun: number;
  /** 맵 1회당 기대수익 (카오스) */
  evPerRun: number;
  /** 시간당 기대수익 (카오스) */
  evPerHour: number;
  /** 맵 1회 예상 소요 시간(분) */
  minutesPerRun: number;
  /** 풀 내 최고가 카드 */
  topCard: CardRow | null;
  cards: CardRow[];
}

export interface EvInput {
  areas: AreaPool[];
  maps: MapInfo[];
  cards: CardInfo[];
  prices: PriceEntry[];
}

/** 이름/슬러그 표기 차이를 흡수하기 위한 정규화 키 */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface Indexed {
  priceByCard: Map<string, PriceEntry>;
  cardInfo: Map<string, CardInfo>;
  mapBySlug: Map<string, MapInfo>;
  /** 카드가 등장하는 지역 수 (맵 + 액트 지역) */
  areaCount: Map<string, number>;
}

export function buildIndex(input: EvInput): Indexed {
  const priceByCard = new Map<string, PriceEntry>();
  for (const p of input.prices) priceByCard.set(normalizeName(p.name), p);

  const cardInfo = new Map<string, CardInfo>();
  for (const c of input.cards) {
    cardInfo.set(normalizeName(c.name), c);
    // NoteCode 는 커런시 익스체인지 슬러그와 동일해 이름 표기가 어긋날 때 대안 키가 된다
    if (c.noteCode) {
      const byNote = input.prices.find((p) => p.slug === c.noteCode);
      if (byNote) priceByCard.set(normalizeName(c.name), byNote);
    }
  }

  const mapBySlug = new Map<string, MapInfo>();
  for (const m of input.maps) mapBySlug.set(m.slug, m);

  const areaCount = new Map<string, number>();
  for (const area of input.areas) {
    for (const entry of area.cards) {
      const key = normalizeName(entry.card);
      areaCount.set(key, (areaCount.get(key) ?? 0) + 1);
    }
  }

  return { priceByCard, cardInfo, mapBySlug, areaCount };
}

function normalize(values: number[]): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return values.map(() => 1 / Math.max(values.length, 1));
  return values.map((v) => v / sum);
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** 단일 맵의 기대수익을 계산한다 */
export function computeMapEv(
  area: AreaPool,
  map: MapInfo,
  index: Indexed,
  params: EvParams,
  refs: { avgMobCount: number; avgClearing: number },
): MapEv {
  const effectiveTier = params.tierMode === 'base' ? map.tier : params.tierMode;
  const eligible = area.cards.filter((c) => c.minTier <= effectiveTier);
  const lockedCount = area.cards.length - eligible.length;

  const base = eligible.map((entry) => {
    const key = normalizeName(entry.card);
    const price = index.priceByCard.get(key);
    const info = index.cardInfo.get(key);
    return {
      entry,
      chaos: price ? Math.max(price.chaos, params.priceFloorChaos) : params.priceFloorChaos,
      estimated: !price,
      volume: price?.volume ?? 0,
      stackSize: info?.stackSize ?? null,
      reward: info?.reward ?? null,
      areaCount: index.areaCount.get(key) ?? 1,
    };
  });

  // 기본 분포: 균등 또는 가격 기반 희소성 (드랍률 ∝ 가격^-β)
  const modelWeights =
    params.weightModel === 'uniform'
      ? base.map(() => 1)
      : base.map((c) => Math.pow(Math.max(c.chaos, 0.1), -params.beta));
  // 실측 분포: 거래량을 드랍 가능 지역 수로 나눠 다른 지역발 공급을 러프하게 덜어낸다
  const supplyWeights = base.map((c) => c.volume / Math.max(c.areaCount, 1));

  const qModel = normalize(modelWeights);
  const hasSupply = supplyWeights.some((v) => v > 0);
  const qSupply = hasSupply ? normalize(supplyWeights) : qModel;
  const lambda = hasSupply ? params.supplyBlend : 0;

  const rows: CardRow[] = base.map((c, i) => {
    const q = (1 - lambda) * qModel[i] + lambda * qSupply[i];
    return {
      card: c.entry.card,
      minTier: c.entry.minTier,
      chaos: c.chaos,
      estimated: c.estimated,
      volume: c.volume,
      stackSize: c.stackSize,
      reward: c.reward,
      areaCount: c.areaCount,
      q,
      contribution: q * c.chaos,
    };
  });
  rows.sort((a, b) => b.contribution - a.contribution);

  const valuePerCard = rows.reduce((a, r) => a + r.contribution, 0);
  const density =
    params.scaleByDensity && map.mobCount && refs.avgMobCount > 0
      ? map.mobCount / refs.avgMobCount
      : 1;
  const cardsPerRun = params.cardsPerRun * density;
  const speed =
    params.scaleTimeByClearing && map.clearingAbility && refs.avgClearing > 0
      ? refs.avgClearing / map.clearingAbility
      : 1;
  const minutesPerRun = params.minutesPerRun * speed;
  const evPerRun = valuePerCard * cardsPerRun;

  return {
    map,
    effectiveTier,
    poolSize: rows.length,
    lockedCount,
    valuePerCard,
    cardsPerRun,
    evPerRun,
    evPerHour: minutesPerRun > 0 ? (evPerRun * 60) / minutesPerRun : 0,
    minutesPerRun,
    topCard: rows.reduce<CardRow | null>(
      (best, r) => (!best || r.chaos > best.chaos ? r : best),
      null,
    ),
    cards: rows,
  };
}

export function computeAll(input: EvInput, params: EvParams): MapEv[] {
  const index = buildIndex(input);
  const refs = {
    avgMobCount: mean(input.maps.map((m) => m.mobCount ?? 0).filter((v) => v > 0)),
    avgClearing: mean(input.maps.map((m) => m.clearingAbility ?? 0).filter((v) => v > 0)),
  };

  const out: MapEv[] = [];
  for (const area of input.areas) {
    if (!area.isMap) continue;
    const map = index.mapBySlug.get(area.slug);
    if (!map) continue;
    out.push(computeMapEv(area, map, index, params, refs));
  }
  out.sort((a, b) => b.evPerRun - a.evPerRun);
  return out;
}

/* ------------------------------------------------------------------ *
 * 가격-희소성 지수 β 실측
 * ------------------------------------------------------------------ */

/**
 * 한 맵에서만 드랍되는 카드들끼리는 그 맵의 실행 횟수가 공통이므로 약분된다.
 * 즉 이들의 거래량 비율은 상대 드랍률의 불편추정치다. 맵별로 중심화한 뒤
 * log(거래량) ~ log(가격) 회귀의 기울기를 모으면 β = -기울기 를 얻는다.
 *
 * 주의: 저가 카드는 거래 자체가 잘 안 되므로 거래량이 드랍을 과소반영하고,
 * 그 결과 β는 과소추정되는 방향으로 편향된다. minPriceChaos 로 완화한다.
 */
export function calibrateBeta(input: EvInput, minPriceChaos = 5): Calibration | null {
  const index = buildIndex(input);
  const points: { x: number; y: number; card: string; map: string; chaos: number; volume: number }[] =
    [];
  let mapsUsed = 0;

  for (const area of input.areas) {
    if (!area.isMap) continue;
    const exclusive = area.cards
      .map((entry) => {
        const key = normalizeName(entry.card);
        const price = index.priceByCard.get(key);
        return {
          card: entry.card,
          chaos: price?.chaos ?? 0,
          volume: price?.volume ?? 0,
          areaCount: index.areaCount.get(key) ?? 1,
        };
      })
      .filter((c) => c.areaCount === 1 && c.chaos >= minPriceChaos && c.volume > 0);
    if (exclusive.length < 2) continue;

    mapsUsed++;
    const lx = exclusive.map((c) => Math.log(c.chaos));
    const ly = exclusive.map((c) => Math.log(c.volume));
    const mx = mean(lx);
    const my = mean(ly);
    exclusive.forEach((c, i) => {
      points.push({
        x: lx[i] - mx,
        y: ly[i] - my,
        card: c.card,
        map: area.name,
        chaos: c.chaos,
        volume: c.volume,
      });
    });
  }

  if (points.length < 3) return null;
  const sxy = points.reduce((a, p) => a + p.x * p.y, 0);
  const sxx = points.reduce((a, p) => a + p.x * p.x, 0);
  const syy = points.reduce((a, p) => a + p.y * p.y, 0);
  if (!(sxx > 0)) return null;
  const slope = sxy / sxx;

  return {
    beta: -slope,
    r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 0,
    samples: points.length,
    maps: mapsUsed,
    minPriceChaos,
    points: points.map((p) => ({ card: p.card, map: p.map, chaos: p.chaos, volume: p.volume })),
  };
}
