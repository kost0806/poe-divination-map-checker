/** 스크레이핑·계산 전 구간에서 공유하는 타입 정의 */

/** 카드가 특정 지역에서 드롭되기 위한 조건 (예: "tier 13+") */
export interface PoolEntry {
  /** 카드 이름 (PoEDB 표기) */
  card: string;
  /** 드롭에 필요한 최소 지도 등급. 조건이 없으면 1 */
  minTier: number;
}

/** 카드가 드롭되는 지역 (지도 또는 액트/기타 지역) */
export interface AreaPool {
  name: string;
  /** 공식 한국어 지역명 */
  nameKo: string | null;
  slug: string;
  /** 아틀라스 지도이면 true. 액트 지역·고유 지도 등은 false */
  isMap: boolean;
  cards: PoolEntry[];
}

/** 지도 상세 메타데이터 (PoEDB 지도 페이지) */
export interface MapInfo {
  name: string;
  /** 공식 한국어 지도명 */
  nameKo: string | null;
  slug: string;
  /** 아틀라스 기본 등급 (MapTier 속성) */
  tier: number;
  /** 지역 레벨 */
  areaLevel: number;
  boss: string | null;
  bossKo: string | null;
  bossDifficulty: number | null;
  /** 몬스터 밀도 지표 (1~10) */
  mobCount: number | null;
  /** 클리어 용이성 지표 (1~10, 높을수록 빠름) */
  clearingAbility: number | null;
  tileset: string | null;
  tilesetKo: string | null;
  tags: string[];
  /** 아틀라스 상 인접 지도 */
  linked: string[];
  linkedKo: string[];
  layout: {
    fewObstacles: boolean | null;
    bossNotInOwnRoom: boolean | null;
    outdoors: boolean | null;
    linear: boolean | null;
  };
}

/** 카드 메타데이터 (PoEDB 카드 페이지) */
export interface CardInfo {
  name: string;
  /** 공식 한국어 카드명 */
  nameKo: string | null;
  slug: string;
  /** 화폐 거래소 NoteCode. 시세 조인 키 */
  noteCode: string | null;
  /** 세트 완성에 필요한 장수 */
  stackSize: number | null;
  reward: string | null;
  /** 공식 한국어 보상 표기 */
  rewardKo: string | null;
  dropLevel: number | null;
  /**
   * 화폐 거래소 골드 수수료 (게임 데이터 CurrencyExchange.GoldPurchaseFee).
   * GGG가 아이템별로 직접 매긴 정적 등급값이라 시장 시세·지도 선호도와 무관한
   * 희소성 신호로 쓸 수 있다. 예) Rain of Chaos 5 · The Doctor 925 · House of Mirrors 1850
   */
  goldFee: number | null;
  flavourText: string | null;
  flavourTextKo: string | null;
}

/** 화폐 거래소 시세 1건 */
export interface PriceEntry {
  name: string;
  slug: string;
  /** 카오스 오브 환산 개당 가격 */
  chaos: number;
  /** 원 표기 통화 */
  unit: 'chaos' | 'divine';
  /** 원 표기 통화 기준 개당 가격 */
  value: number;
  /** 24시간 거래량 (장) */
  volume: number;
  /** 7일 변동률 (%) */
  change: number | null;
}

/** 빌드 타임에 생성되는 정적 데이터셋 (패치 단위로만 변함) */
export interface StaticData {
  generatedAt: string;
  patchNote: string;
  areas: AreaPool[];
  maps: MapInfo[];
  cards: CardInfo[];
}

/** 런타임에 갱신되는 시세 스냅샷 */
export interface PriceData {
  fetchedAt: string;
  league: string | null;
  /** 1 신성한 오브 = ? 카오스 오브 */
  divineChaos: number;
  prices: PriceEntry[];
}

export interface LeagueInfo {
  id: string;
  startAt: string | null;
  endAt: string | null;
}

/** /api/dataset 응답 */
export interface Dataset {
  static: StaticData;
  prices: PriceData;
  league: LeagueInfo | null;
  /** 시세 원본 조회 실패로 커밋된 스냅샷을 사용 중인지 */
  stale: boolean;
  /** 데이터로부터 실측한 가격-희소성 회귀 결과 */
  calibration: Calibration | null;
}

/** 같은 지도 전용 카드들의 (골드 수수료, 거래량) 회귀 결과 */
export interface Calibration {
  /** 드롭률 ∝ 골드^(-gamma) 의 gamma 추정치 */
  gamma: number;
  r2: number;
  /** 관측 쌍 개수 */
  samples: number;
  /** 사용된 지도 개수 */
  maps: number;
  /** 회귀에 포함할 최소 거래량 */
  minVolume: number;
  points: { card: string; map: string; gold: number; chaos: number; volume: number }[];
}
