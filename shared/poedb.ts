/**
 * PoEDB(poedb.tw) HTML 파서.
 *
 * PoEDB는 게임 클라이언트 데이터(.dat/.it)와 인게임 화폐 거래소 시세를
 * 그대로 노출하는 사이트로, robots.txt 전면 허용이며 별도 API가 없어 HTML을 파싱한다.
 * 마크업이 바뀌면 여기만 고치면 되도록 파서를 한 곳에 모아둔다.
 */
import type { AreaPool, CardInfo, MapInfo, PoolEntry, PriceEntry } from './types.js';

export type Locale = 'us' | 'kr';

/** PoEDB는 언어별로 같은 슬러그를 쓰므로 로케일만 갈아끼우면 공식 번역명을 얻는다 */
export function poedbBase(locale: Locale = 'us'): string {
  return `https://poedb.tw/${locale}`;
}

export const POEDB_BASE = poedbBase('us');

const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ');

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'");
}

/** 태그 제거 + 엔티티 복원 + 공백 정규화 */
export function text(html: string): string {
  return decodeEntities(stripTags(html)).replace(/\s+/g, ' ').trim();
}

function tables(html: string): string[] {
  return html.match(/<table[\s\S]*?<\/table>/g) ?? [];
}

function rows(table: string): string[] {
  return table.match(/<tr[\s\S]*?<\/tr>/g) ?? [];
}

function cells(row: string): string[] {
  return (row.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? []).map((c) =>
    c.replace(/^<td[^>]*>/, '').replace(/<\/td>$/, ''),
  );
}

function toNumber(s: string): number | null {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ *
 * /us/Divination_Cards — 지역별 드롭 카드 목록
 * ------------------------------------------------------------------ */

/**
 * "The Doctor (tier 7+)" 형태의 조건을 최소 등급로 변환한다.
 * 조건이 없거나 해석 불가면 1(제한 없음).
 */
function parseTierCondition(condition: string | null): number {
  if (!condition) return 1;
  const m = condition.match(/tier\s*(\d+)\s*\+/i);
  return m ? Number(m[1]) : 1;
}

export function parseAreaCards(html: string): AreaPool[] {
  const table = tables(html)[0];
  if (!table) throw new Error('Divination_Cards: 지역-카드 표를 찾지 못했습니다');

  const out: AreaPool[] = [];
  for (const row of rows(table)) {
    const td = cells(row);
    if (td.length < 2) continue;

    const area = td[0].match(/<a class="([^"]*)"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (!area) continue;

    const [, className, slug, label] = area;
    const cards: PoolEntry[] = [];
    // 카드들은 가운뎃점(·)으로 구분되고, 각 항목 뒤에 "(tier N+)" 조건이 붙을 수 있다
    for (const chunk of td[1].split('·')) {
      const link = chunk.match(/<a class="divination[^"]*"[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>/);
      if (!link) continue;
      const condition = text(chunk).match(/\(([^)]*)\)\s*$/);
      cards.push({ card: text(link[1]), minTier: parseTierCondition(condition?.[1] ?? null) });
    }
    if (!cards.length) continue;

    out.push({
      name: text(label),
      nameKo: null,
      slug,
      isMap: className.split(/\s+/).includes('Map'),
      cards,
    });
  }
  if (!out.length) throw new Error('Divination_Cards: 파싱 결과가 비었습니다');
  return out;
}

/* ------------------------------------------------------------------ *
 * /us/Economy_* — 화폐 거래소 시세
 * ------------------------------------------------------------------ */

/**
 * 시세 셀은 "605 [divine] ↔ 1 [the-doctor]" 처럼 교환 비율로 표기된다.
 * 좌변이 통화, 우변이 대상 아이템이므로 개당 가격은 (좌변 수량 / 우변 수량).
 */
function parseExchangeCell(cell: string): { unit: string; value: number } | null {
  const m = cell.match(
    /([\d.,]+)\s*<a href="Economy_([a-z0-9-]+)">[\s\S]*?([\d.,]+)\s*<a href="Economy_([a-z0-9-]+)">/,
  );
  if (!m) return null;
  const left = toNumber(m[1]);
  const right = toNumber(m[3]);
  if (left === null || right === null || right === 0) return null;
  return { unit: m[2], value: left / right };
}

export interface RawEconomyRow {
  name: string;
  slug: string;
  unit: string;
  value: number;
  volume: number;
  change: number | null;
}

export function parseEconomyTable(html: string): RawEconomyRow[] {
  const table = tables(html)[0];
  if (!table) throw new Error('Economy: 시세 표를 찾지 못했습니다');

  const out: RawEconomyRow[] = [];
  for (const row of rows(table)) {
    const td = cells(row);
    if (td.length < 4) continue;

    const name = td[0].match(/href="Economy_([a-z0-9-]+)">(?:<img[^>]*>)?([^<]*)<\/a>/);
    if (!name) continue;
    const exchange = parseExchangeCell(td[1]);
    if (!exchange) continue;

    const change = td[2].match(/([+-]?\d+(?:\.\d+)?)%/);
    out.push({
      name: decodeEntities(name[2]).trim(),
      slug: name[1],
      unit: exchange.unit,
      value: exchange.value,
      volume: toNumber(text(td[3])) ?? 0,
      change: change ? Number(change[1]) : null,
    });
  }
  return out;
}

/** 신성한 오브/카오스 오브 이외 통화로 표기된 항목은 환산 불가로 제외한다 */
export function toPriceEntries(raw: RawEconomyRow[], divineChaos: number): PriceEntry[] {
  const out: PriceEntry[] = [];
  for (const r of raw) {
    if (r.unit !== 'chaos' && r.unit !== 'divine') continue;
    out.push({
      name: r.name,
      slug: r.slug,
      unit: r.unit,
      value: r.value,
      chaos: r.unit === 'divine' ? r.value * divineChaos : r.value,
      volume: r.volume,
      change: r.change,
    });
  }
  return out;
}

/** 화폐 시세표에서 1 신성한 오브 = ? 카오스 오브를 추출 */
export function parseDivineChaos(html: string): number {
  for (const r of parseEconomyTable(html)) {
    if (r.slug === 'divine' && r.unit === 'chaos') return r.value;
    if (r.slug === 'chaos' && r.unit === 'divine' && r.value > 0) return 1 / r.value;
  }
  throw new Error('Economy_Currency: 신성한 오브-카오스 오브 환율을 찾지 못했습니다');
}

/* ------------------------------------------------------------------ *
 * 개별 아이템 페이지 (지도 / 카드)
 * ------------------------------------------------------------------ */

/** `<tr><td>키</td><td>값</td></tr>` 속성 표를 사전으로 만든다 */
function attributeMap(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /<tr>\s*<td>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const key = text(m[1]);
    if (!key || out.has(key)) continue;
    out.set(key, m[2]);
  }
  return out;
}

/** 한국어판은 일부 속성 키가 번역돼 있어(레벨, 보스) 후보 키를 순서대로 찾는다 */
function pick(attr: Map<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = attr.get(key);
    if (value !== undefined) return value;
  }
  return undefined;
}

const num = (v: string | undefined) => (v === undefined ? null : toNumber(text(v)));
const list = (v: string | undefined) =>
  v === undefined ? [] : text(v).split(',').map((s) => s.trim()).filter(Boolean);
/** 레이아웃 표는 'o'(예) / 'x'(아니오)로 표기 */
const flag = (v: string | undefined) => {
  const t = v === undefined ? '' : text(v).toLowerCase();
  return t === 'o' ? true : t === 'x' ? false : null;
};

export function parseMapPage(html: string, name: string, slug: string): MapInfo {
  const attr = attributeMap(html);
  const areaLevel = num(pick(attr, 'Level', '레벨'));
  const tier = num(attr.get('MapTier'));
  return {
    name,
    nameKo: null,
    slug,
    // MapTier 속성이 아틀라스 기본 등급. 없으면 지역 레벨에서 역산(1등급 = 68)
    tier: tier ?? (areaLevel !== null ? Math.max(1, areaLevel - 67) : 0),
    areaLevel: areaLevel ?? 0,
    boss: (() => {
      const value = pick(attr, 'Boss', '보스');
      return value ? text(value) || null : null;
    })(),
    bossKo: null,
    bossDifficulty: num(pick(attr, 'Boss Difficulty')),
    mobCount: num(pick(attr, 'Mob Count')),
    clearingAbility: num(pick(attr, 'Clearing Ability')),
    tileset: (() => {
      const value = pick(attr, 'Tileset', '타일세트');
      return value ? text(value) || null : null;
    })(),
    tilesetKo: null,
    tags: list(attr.get('Tags')),
    linked: list(attr.get('Atlas Linked')),
    linkedKo: [],
    layout: {
      fewObstacles: flag(attr.get('Few Obstacles')),
      bossNotInOwnRoom: flag(attr.get('Boss not in own room')),
      outdoors: flag(attr.get('Outdoors')),
      linear: flag(attr.get('Linear')),
    },
  };
}

/** PoE 텍스트 마크업(<size:23>, {강조}) 제거 */
function cleanItemText(raw: string): string {
  return text(raw.replace(/<br\s*\/?>/gi, ' / ').replace(/<size:\d+>/gi, ''))
    .replace(/[{}]/g, '')
    .trim();
}

export function parseCardPage(html: string, name: string, slug: string): CardInfo {
  const attr = attributeMap(html);
  const stack = html.match(/<div class="stackSize">(\d+)<\/div>/);
  const flavour = html.match(/<div class='FlavourText'>([\s\S]*?)<\/div>/);
  // 카드 아트의 보상 영역에는 수량까지 들어 있다 ("5x Divine Orb").
  // 속성표의 Reward 행은 아이템 이름만 있어 수량이 빠진다.
  const explicit = html.match(/<div class='explicitArea'>([\s\S]*?)<\/div>\s*<\/div>/);
  const reward = attr.get('Reward');
  const gold = attr.get('Currency Exchange');
  return {
    name,
    nameKo: null,
    slug,
    noteCode: attr.has('NoteCode') ? text(attr.get('NoteCode')!) || null : null,
    stackSize: stack ? Number(stack[1]) : null,
    reward: explicit ? cleanItemText(explicit[1]) || null : reward ? text(reward) || null : null,
    rewardKo: null,
    dropLevel: num(attr.get('DropLevel')),
    // "925 Gold" 형태로 표기된다
    goldFee: gold ? toNumber(text(gold).replace(/[^\d.]/g, '')) : null,
    flavourText: flavour ? cleanItemText(flavour[1]) || null : null,
    flavourTextKo: null,
  };
}

/**
 * 지역-카드 표에서 카드 이름 → PoEDB 문서 슬러그 매핑을 뽑는다.
 * (개별 카드 페이지를 크롤링할 때 필요)
 */
export function parseCardLinks(html: string): Map<string, string> {
  const table = tables(html)[0];
  const out = new Map<string, string>();
  if (!table) return out;
  const re = /<a class="divination[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(table))) {
    const name = text(m[2]);
    if (name && !out.has(name)) out.set(name, m[1]);
  }
  return out;
}
