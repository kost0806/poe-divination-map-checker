import { GAMMA_BOUNDS, VOIDSTONE_TIER, type EvParams } from '../../shared/ev';

export interface ViewOptions {
  sort: 'index' | 'paybackIndex' | 'tier';
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
  pinCount: number;
  onClearPins: () => void;
  onReset: () => void;
}

export function Controls({ params, onParams, view, onView, pinCount, onClearPins, onReset }: Props) {
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
            <option value="index">기대 지표 (높은 순)</option>
            <option value="paybackIndex">예지 비용 대비 회수 (빠른 순)</option>
            <option value="tier">지도 등급</option>
          </select>
        </div>
        <div className="field">
          <label>지도 등급 범위</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="number" min={1} max={VOIDSTONE_TIER} value={view.minTier}
              onChange={(e) => setView('minTier', Number(e.target.value))}
            />
            <span className="dim">~</span>
            <input
              type="number" min={1} max={VOIDSTONE_TIER} value={view.maxTier}
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
            <option value="measured">커뮤니티 실측 가중치 (권장)</option>
            <option value="gold">골드 수수료 추정</option>
            <option value="uniform">균등 (모든 카드 동일 확률)</option>
          </select>
          <div className="hint">
            {params.weightSource === 'measured' &&
              'Divcord 커뮤니티가 스택된 덱 116만 개를 열어 실측한 카드별 가중치. 카드가 드롭됐을 때 그 카드일 확률을 그대로 쓴다.'}
            {params.weightSource === 'gold' &&
              '골드 수수료로 추정한다. 실측 가중치와의 회귀는 가중치 ∝ 골드^-2.35 (R²=0.87) 이지만 카드별 편차가 크다.'}
            {params.weightSource === 'uniform' && '모든 카드가 같은 확률로 나온다고 가정한다.'}
          </div>
        </div>

        {params.weightSource === 'gold' && (
          <div className="field">
            <label>
              희소성 지수 γ <span className="value">{params.gamma.toFixed(2)}</span>
            </label>
            <input
              type="range" min={GAMMA_BOUNDS.min} max={GAMMA_BOUNDS.max} step={0.05} value={params.gamma}
              onChange={(e) => set('gamma', Number(e.target.value))}
            />
            <div className="hint">드롭률 ∝ 골드<sup>-γ</sup>. 실측 회귀값은 2.35 다.</div>
          </div>
        )}

        <div className="field">
          <label>
            지도 1판당 카드 드롭 수 <span className="value">{params.dropsPerMap}</span>
          </label>
          <input
            type="range" min={0.5} max={100} step={0.5} value={params.dropsPerMap}
            onChange={(e) => set('dropsPerMap', Number(e.target.value))}
          />
          <div className="hint">
            모든 지도에 공통으로 곱해지므로 순위와 배율은 바뀌지 않는다. 드롭 빈도 표기가 체감과 맞도록
            조절하면 된다. 스택된 덱 가중치를 지역 드롭률로 바꾸는 비율을 알 수 없어 이 값이 그 차이를
            함께 흡수하므로, 실제 드롭 장수보다 큰 값이 필요할 수 있다.
          </div>
        </div>

        <div className="field">
          <label className="check" style={{ marginBottom: 4 }}>
            <input
              type="checkbox" checked={params.includeGlobalPool}
              onChange={(e) => set('includeGlobalPool', e.target.checked)}
            />
            확률 분모에 전역 풀 포함
          </label>
          <div className="hint">
            카드가 드롭될 때 후보는 그 지역에서 나올 수 있는 카드들이다. 지역 제한이 없는 카드까지 후보에
            넣으면 지도 전용 카드의 확률이 그만큼 희석된다. 끄면 지도 전용 카드끼리만 경쟁한다고 본다.
            실제 후보 구성은 공개 데이터로 확정할 수 없다.
          </div>
        </div>

        <div className="field">
          <label>
            보스 카드 드롭 기회 <span className="value">{Math.round(params.bossDropRatio * 100)}%</span>
          </label>
          <input
            type="range" min={0} max={1} step={0.05} value={params.bossDropRatio}
            onChange={(e) => set('bossDropRatio', Number(e.target.value))}
          />
          <div className="hint">
            보스에서만 나오는 카드는 판당 한 번뿐인 보스 처치에서만 기회가 생긴다. 일반 카드 대비 몇 %의
            기회를 줄지 정한다.
          </div>
        </div>

        <div className="field">
          <label>실행 등급 가정</label>
          <select
            value={typeof params.tierMode === 'number' ? String(params.tierMode) : params.tierMode}
            onChange={(e) => {
              const value = e.target.value;
              set('tierMode', value === 'base' || value === 'voidstone' ? value : Number(value));
            }}
          >
            <option value="voidstone">공허석 4개 (전부 16등급)</option>
            <option value="base">공허석 없음 (지도 고유 등급)</option>
            {Array.from({ length: VOIDSTONE_TIER }, (_, i) => i + 1).map((t) => (
              <option key={t} value={t}>{t}등급으로 돌린다고 가정</option>
            ))}
          </select>
          <div className="hint">
            지역 레벨이 카드의 드롭 레벨보다 낮으면 그 카드는 나오지 않는다. 공허석 4개면 아틀라스 전체가
            16등급(지역 레벨 83)이 되고, 이 경우 잠기는 카드는 없다.
          </div>
        </div>

        {pinCount > 0 && (
          <div className="field">
            <label>실측으로 고정한 카드 {pinCount}종</label>
            <button className="linkBtn" onClick={onClearPins}>전부 해제</button>
          </div>
        )}

        <button
          onClick={onReset}
          style={{
            marginTop: 4, width: '100%', background: 'var(--panel-2)', color: 'var(--muted)',
            border: '1px solid var(--line)', borderRadius: 4, padding: '6px', cursor: 'pointer',
          }}
        >
          기본값으로
        </button>
      </div>
    </div>
  );
}
