import { useEffect, useMemo, useRef, useState } from 'react';
import {
  computeAll,
  DEFAULT_PARAMS,
  GAMMA_BOUNDS,
  pinKey,
  solveGamma,
  type EvInput,
  type EvParams,
  type MapEv,
} from '../shared/ev';
import type { Dataset } from '../shared/types';
import { Controls, type ViewOptions } from './components/Controls';
import { MapDetail } from './components/MapDetail';
import { MapTable } from './components/MapTable';
import { Methodology } from './components/Methodology';
import { chaos, paybackRuns, round, timeAgo } from './lib/format';
import { ko, shortMapName } from './lib/names';

const FAV_KEY = 'poe-div-favourites';
const PIN_KEY = 'poe-div-pinned-rates';

const DEFAULT_VIEW: ViewOptions = {
  sort: 'evPerRun',
  minTier: 1,
  maxTier: 16,
  query: '',
  favouritesOnly: false,
};

function loadPins(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function loadFavourites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<EvParams>({ ...DEFAULT_PARAMS, pinnedRates: loadPins() });
  const [view, setView] = useState<ViewOptions>(DEFAULT_VIEW);
  const [tab, setTab] = useState<'maps' | 'method'>('maps');
  const [selected, setSelected] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<Set<string>>(loadFavourites);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/dataset')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Dataset) => setDataset(d))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    localStorage.setItem(FAV_KEY, JSON.stringify([...favourites]));
  }, [favourites]);

  useEffect(() => {
    localStorage.setItem(PIN_KEY, JSON.stringify(params.pinnedRates));
  }, [params.pinnedRates]);

  // 상세는 표 위에 열리므로, 표 아래쪽 행을 눌렀을 때도 보이도록 스크롤한다
  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selected]);

  const evInput: EvInput | null = useMemo(
    () =>
      dataset
        ? {
            areas: dataset.static.areas,
            maps: dataset.static.maps,
            cards: dataset.static.cards,
            prices: dataset.prices.prices,
            scrying: dataset.scrying?.prices,
            weights: dataset.static.weights,
          }
        : null,
    [dataset],
  );

  const all: MapEv[] = useMemo(
    () => (evInput ? computeAll(evInput, params) : []),
    [evInput, params],
  );

  const rows = useMemo(() => {
    const q = view.query.trim().toLowerCase();
    const filtered = all.filter((r) => {
      if (r.map.tier < view.minTier || r.map.tier > view.maxTier) return false;
      if (view.favouritesOnly && !favourites.has(r.map.slug)) return false;
      if (!q) return true;
      return (
        r.map.name.toLowerCase().includes(q) ||
        (r.map.nameKo ?? '').toLowerCase().includes(q) ||
        r.cards.some((c) => c.card.toLowerCase().includes(q) || (c.cardKo ?? '').includes(q)) ||
        r.locked.some((c) => c.card.toLowerCase().includes(q) || (c.cardKo ?? '').includes(q))
      );
    });
    const key = view.sort;
    return [...filtered].sort((a, b) => {
      if (key === 'tier') return b.map.tier - a.map.tier || b.evPerRun - a.evPerRun;
      // 회수 판수는 작을수록 좋고, 예지 비용을 모르는 지도는 뒤로 보낸다
      if (key === 'paybackRuns') {
        return (a.paybackRuns ?? Infinity) - (b.paybackRuns ?? Infinity);
      }
      return b[key] - a[key];
    });
  }, [all, view, favourites]);

  const selectedRow = rows.find((r) => r.map.slug === selected) ?? null;
  const favRows = all.filter((r) => favourites.has(r.map.slug));

  const toggleFavourite = (slug: string) =>
    setFavourites((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  if (error) {
    return (
      <div className="app">
        <div className="banner">
          데이터를 불러오지 못했습니다: <span className="badText">{error}</span>
        </div>
      </div>
    );
  }
  if (!dataset) return <div className="app dim">데이터 불러오는 중…</div>;

  const div = dataset.prices.divineChaos;

  return (
    <div className="app">
      <header className="top">
        <h1>지도별 점술 카드 기대 수익</h1>
        <div className="meta">
          <span>리그 <b>{dataset.league?.id ?? '알 수 없음'}</b></span>
          <span>1 디바인 = <b>{round(div)}</b> 카오스</span>
          <span>시세 <b>{timeAgo(dataset.prices.fetchedAt)}</b></span>
          <span>지도 <b>{all.length}</b>개</span>
        </div>
      </header>

      {dataset.stale && (
        <div className="banner">
          실시간 시세 조회에 실패해 저장된 스냅숏({timeAgo(dataset.prices.fetchedAt)})으로 계산 중입니다.
        </div>
      )}

      <div className="tabs">
        <button className={tab === 'maps' ? 'active' : ''} onClick={() => setTab('maps')}>
          지도 순위
        </button>
        <button className={tab === 'method' ? 'active' : ''} onClick={() => setTab('method')}>
          계산 방식과 한계
        </button>
      </div>

      {tab === 'method' ? (
        <Methodology dataset={dataset} />
      ) : (
        <div className="layout">
          <Controls
            params={params}
            onParams={setParams}
            view={view}
            onView={setView}
            calibration={dataset.calibration}
            onReset={() => {
              // 실측 고정은 사용자가 직접 넣은 데이터라 초기화에서 건드리지 않는다
              setParams((prev) => ({ ...DEFAULT_PARAMS, pinnedRates: prev.pinnedRates }));
              setView(DEFAULT_VIEW);
            }}
          />

          <div>
            {favRows.length > 0 && (
              <div className="panel" style={{ marginBottom: 12 }}>
                <h2>선호 지도 {favRows.length}개</h2>
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>지도</th>
                        <th style={{ width: 52 }}>등급</th>
                        <th className="num">1회당</th>
                        <th className="num">시간당</th>
                        <th className="num">회수</th>
                        <th>주력 점술 카드</th>
                        <th style={{ width: 28 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...favRows]
                        .sort((a, b) => b.evPerRun - a.evPerRun)
                        .map((r) => (
                          <tr key={r.map.slug} className="clickable" onClick={() => setSelected(r.map.slug)}>
                            <td>{shortMapName(r.map.nameKo, r.map.name)}</td>
                            <td><span className="tier">{r.map.tier}</span></td>
                            <td className="num chaos">{chaos(r.evPerRun, div)}</td>
                            <td className="num">{chaos(r.evPerHour, div)}</td>
                            <td className="num dim">
                              {paybackRuns(r.paybackRuns)}
                            </td>
                            <td className="small dim">{r.cards[0] ? ko(r.cards[0].cardKo, r.cards[0].card) : '-'}</td>
                            <td>
                              <button
                                className="fav on"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavourite(r.map.slug);
                                }}
                              >
                                ★
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedRow && (
              <div ref={detailRef}>
                <MapDetail
                  row={selectedRow}
                  divineChaos={div}
                  params={params}
                  onCalibrateScale={(cardsPerRun) => setParams((prev) => ({ ...prev, cardsPerRun }))}
                  onCalibrateGamma={(card, dropsPerRun) => {
                    const gamma = solveGamma(
                      evInput!,
                      params,
                      selectedRow.map.slug,
                      card,
                      dropsPerRun,
                      GAMMA_BOUNDS,
                    );
                    if (gamma !== null) setParams((prev) => ({ ...prev, gamma }));
                    return gamma;
                  }}
                  onPinRate={(card, dropsPerRun) =>
                    setParams((prev) => {
                      const next = { ...prev.pinnedRates };
                      const key = pinKey(selectedRow.map.slug, card);
                      if (dropsPerRun === null) delete next[key];
                      else next[key] = dropsPerRun;
                      return { ...prev, pinnedRates: next };
                    })
                  }
                />
              </div>
            )}

            <div className="panel" style={{ marginTop: 12 }}>
              <MapTable
                rows={rows}
                divineChaos={div}
                selected={selected}
                favourites={favourites}
                onSelect={(slug) => setSelected(slug === selected ? null : slug)}
                onToggleFavourite={toggleFavourite}
              />
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
