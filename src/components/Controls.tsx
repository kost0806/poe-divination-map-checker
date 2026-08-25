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
            <option value="evPerRun">지도 1회당 기대 수익</option>
            <option value="evPerHour">시간당 기대 수익</option>
            <option value="valuePerCard">점술 카드 1장당 가치</option>
            <option value="tier">지도 등급</option>
          </select>
        </div>
        <div className="field">
          <label>지도 등급 범위</label>
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
          <label>지도 · 점술 카드 검색</label>
          <input
            type="text" value={view.query} placeholder="예: 공동묘지, 의사"
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
        <h2>드롭률 가정</h2>

        <div className="field">
          <label>상대 드롭률 근거</label>
          <select
            value={params.weightSource}
            onChange={(e) => set('weightSource', e.target.value as EvParams['weightSource'])}
          >
            <option value="gold">골드 수수료 (권장)</option>
            <option value="uniform">균등 (모든 카드 동일 확률)</option>
            <option value="volume">24시간 거래량 (편향 주의)</option>
          </select>
          <div className="hint">
            {params.weightSource === 'gold' &&
              '화폐 거래소 골드 수수료는 GGG가 아이템마다 직접 매긴 고정값이라 시세나 지도 선호도와 무관하다.'}
            {params.weightSource === 'uniform' && '그 지도의 전용 카드가 모두 같은 확률로 나온다고 가정한다.'}
            {params.weightSource === 'volume' &&
              '값싼 카드는 거래 자체가 안 되므로 드롭량이 크게 과소 반영된다. 비교용으로만 쓸 것.'}
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
              드롭률 ∝ 골드<sup>-γ</sup>. 기본값 1.00 은 드롭률이 골드 수수료에 정확히 반비례한다는 뜻이다.
              {calibration && (
                <>
                  {' '}현재 시세로 실측하면 {calibration.gamma.toFixed(2)} (R²=
                  {calibration.r2.toFixed(2)}, 표본 {calibration.samples}).{' '}
                  <button className="linkBtn" onClick={() => set('gamma', Math.round(calibration.gamma * 20) / 20)}>
                    실측값 적용
                  </button>
                  {' '}실측치는 거래량이 0인 흔한 카드가 표본에서 빠져 날마다 흔들리고 과소추정되는 편이다.
                </>
              )}
            </div>
          </div>
        )}

        <div className="field">
          <label>실행 등급 가정</label>
          <select
            value={params.tierMode === 'base' ? 'base' : String(params.tierMode)}
            onChange={(e) => set('tierMode', e.target.value === 'base' ? 'base' : Number(e.target.value))}
          >
            <option value="base">각 지도 고유 등급</option>
            {Array.from({ length: 17 }, (_, i) => i + 1).map((t) => (
              <option key={t} value={t}>{t}등급으로 돌린다고 가정</option>
            ))}
          </select>
          <div className="hint">지역 레벨이 카드의 드롭 레벨보다 낮으면 그 카드는 나오지 않는다.</div>
        </div>
      </div>

      <div className="panel">
        <h2>수익 환산</h2>
        <div className="field">
          <label>
            평균 지도 1회당 전용 카드 <span className="value">{params.cardsPerRun.toFixed(2)}장</span>
          </label>
          <input
            type="range" min={0.1} max={4} step={0.05} value={params.cardsPerRun}
            onChange={(e) => set('cardsPerRun', Number(e.target.value))}
          />
          <div className="hint">모든 지도에 같은 비율로 곱해지는 값이라 순위는 바뀌지 않는다.</div>
        </div>
        <div className="field">
          <label>
            기준 지도 1회 소요 <span className="value">{params.minutesPerRun}분</span>
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
          몬스터 밀도로 드롭량 보정
        </label>
        <label className="check">
          <input
            type="checkbox" checked={params.scaleTimeByClearing}
            onChange={(e) => set('scaleTimeByClearing', e.target.checked)}
          />
          클리어 속도로 소요 시간 보정
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
