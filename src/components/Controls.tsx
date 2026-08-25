import type { EvParams } from '../../shared/ev';
import type { Calibration } from '../../shared/types';

export interface ViewOptions {
  sort: 'evPerRun' | 'evPerHour' | 'valuePerCard' | 'tier';
  minTier: number;
  maxTier: number;
  query: string;
  favouritesOnly: boolean;
}

interface Props {
  params: EvParams;
  onParams: (next: EvParams) => void;
  view: ViewOptions;
  onView: (next: ViewOptions) => void;
  calibration: Calibration | null;
  onReset: () => void;
}

export function Controls({ params, onParams, view, onView, calibration, onReset }: Props) {
  const set = <K extends keyof EvParams>(key: K, value: EvParams[K]) =>
    onParams({ ...params, [key]: value });
  const setView = <K extends keyof ViewOptions>(key: K, value: ViewOptions[K]) =>
    onView({ ...view, [key]: value });

  return (
    <div>
      <div className="panel">
        <h2>보기</h2>
        <div className="field">
          <label>정렬</label>
          <select value={view.sort} onChange={(e) => setView('sort', e.target.value as ViewOptions['sort'])}>
            <option value="evPerRun">맵 1회당 기대수익</option>
            <option value="evPerHour">시간당 기대수익</option>
            <option value="valuePerCard">카드 1장당 가치</option>
            <option value="tier">맵 티어</option>
          </select>
        </div>
        <div className="field">
          <label>맵 티어 범위</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="number" min={1} max={17} value={view.minTier}
              onChange={(e) => setView('minTier', Number(e.target.value))}
            />
            <span className="dim">~</span>
            <input
              type="number" min={1} max={17} value={view.maxTier}
              onChange={(e) => setView('maxTier', Number(e.target.value))}
            />
          </div>
        </div>
        <div className="field">
          <label>맵 · 카드 검색</label>
          <input
            type="text" value={view.query} placeholder="예: Cemetery, The Doctor"
            onChange={(e) => setView('query', e.target.value)}
          />
        </div>
        <label className="check">
          <input
            type="checkbox" checked={view.favouritesOnly}
            onChange={(e) => setView('favouritesOnly', e.target.checked)}
          />
          선호 지도만 보기
        </label>
      </div>

      <div className="panel">
        <h2>드랍률 가정</h2>

        <div className="field">
          <label>상대 드랍률 근거</label>
          <select
            value={params.weightSource}
            onChange={(e) => set('weightSource', e.target.value as EvParams['weightSource'])}
          >
            <option value="gold">골드 수수료 (권장)</option>
            <option value="uniform">균등 (풀 내 동일 확률)</option>
            <option value="volume">24h 거래량 (편향 주의)</option>
          </select>
          <div className="hint">
            {params.weightSource === 'gold' &&
              '커런시 익스체인지 골드 수수료는 GGG가 아이템마다 직접 매긴 정적 값이라 시세·맵 인기도와 무관하다.'}
            {params.weightSource === 'uniform' && '풀 안의 모든 카드가 같은 확률로 나온다고 가정한다.'}
            {params.weightSource === 'volume' &&
              '저가 카드는 거래 자체가 안 되므로 드랍량이 크게 과소반영된다. 비교용으로만 쓸 것.'}
          </div>
        </div>

        {params.weightSource === 'gold' && (
          <div className="field">
            <label>
              희소성 지수 γ <span className="value">{params.gamma.toFixed(2)}</span>
            </label>
            <input
              type="range" min={0.3} max={2.5} step={0.05} value={params.gamma}
              onChange={(e) => set('gamma', Number(e.target.value))}
            />
            <div className="hint">
              드랍률 ∝ 골드<sup>-γ</sup>.
              {calibration
                ? ` 실측 ${calibration.gamma.toFixed(2)} (R²=${calibration.r2.toFixed(2)}, 표본 ${calibration.samples}).
                    거래량 0인 흔한 카드가 표본에서 빠져 실제 γ는 이보다 클 수 있다.`
                : ''}
            </div>
          </div>
        )}

        <div className="field">
          <label>실행 티어 가정</label>
          <select
            value={params.tierMode === 'base' ? 'base' : String(params.tierMode)}
            onChange={(e) => set('tierMode', e.target.value === 'base' ? 'base' : Number(e.target.value))}
          >
            <option value="base">각 맵 고유 티어</option>
            {Array.from({ length: 17 }, (_, i) => i + 1).map((t) => (
              <option key={t} value={t}>T{t} 로 돌린다고 가정</option>
            ))}
          </select>
          <div className="hint">지역 레벨이 카드 DropLevel보다 낮으면 그 카드는 드랍되지 않는다.</div>
        </div>
      </div>

      <div className="panel">
        <h2>수익 환산</h2>
        <div className="field">
          <label>
            평균 맵 1회당 전용 카드 <span className="value">{params.cardsPerRun.toFixed(2)}장</span>
          </label>
          <input
            type="range" min={0.1} max={4} step={0.05} value={params.cardsPerRun}
            onChange={(e) => set('cardsPerRun', Number(e.target.value))}
          />
          <div className="hint">모든 맵에 같은 비율로 곱해지는 스케일 값. 순위는 바뀌지 않는다.</div>
        </div>
        <div className="field">
          <label>
            기준 맵 1회 소요 <span className="value">{params.minutesPerRun}분</span>
          </label>
          <input
            type="range" min={1} max={15} step={0.5} value={params.minutesPerRun}
            onChange={(e) => set('minutesPerRun', Number(e.target.value))}
          />
        </div>
        <label className="check">
          <input
            type="checkbox" checked={params.scaleByDensity}
            onChange={(e) => set('scaleByDensity', e.target.checked)}
          />
          몹 밀도로 드랍량 보정
        </label>
        <label className="check">
          <input
            type="checkbox" checked={params.scaleTimeByClearing}
            onChange={(e) => set('scaleTimeByClearing', e.target.checked)}
          />
          클리어 지표로 소요 시간 보정
        </label>
        <button
          onClick={onReset}
          style={{
            marginTop: 8, width: '100%', background: 'var(--panel-2)', color: 'var(--muted)',
            border: '1px solid var(--line)', borderRadius: 4, padding: '6px', cursor: 'pointer',
          }}
        >
          기본값으로
        </button>
      </div>
    </div>
  );
}
