import { useState } from 'react';
import type { EvParams, MapEv } from '../../shared/ev';
import { chaos, formatMinutes, frequency, paybackRuns, percent, round } from '../lib/format';
import { ko, poedbUrl } from '../lib/names';

interface Props {
  row: MapEv;
  divineChaos: number;
  params: EvParams;
  /** 전체 카드 관측 → 지도당 카드 수(스케일) 보정 */
  onCalibrateScale: (cardsPerRun: number) => void;
  /** 특정 카드 관측 → 희소성 지수 γ 역산. 재현 불가능하면 null 을 돌려준다 */
  onCalibrateGamma: (card: string, dropsPerRun: number) => number | null;
  /** 특정 카드의 드롭률을 관측값으로 고정하거나(값 지정), 해제한다(null) */
  onPinRate: (card: string, dropsPerRun: number | null) => void;
}

const layoutLabel = (v: boolean | null) => (v === null ? '-' : v ? '예' : '아니오');

/** 카드 이름을 PoEDB 문서로 연결한다 */
function CardLink({ name, slug }: { name: string; slug: string | null }) {
  const url = poedbUrl(slug);
  if (!url) return <>{name}</>;
  return (
    <a className="cardLink" href={url} target="_blank" rel="noreferrer noopener" title="PoEDB에서 보기">
      {name}
    </a>
  );
}

export function MapDetail({
  row,
  divineChaos,
  params,
  onCalibrateScale,
  onCalibrateGamma,
  onPinRate,
}: Props) {
  const { map } = row;
  const [target, setTarget] = useState('__all__');
  const [runs, setRuns] = useState('');
  const [drops, setDrops] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const runCount = Number(runs);
  const dropCount = Number(drops);
  const observedRate = runCount > 0 ? dropCount / runCount : 0;
  const targetRow = row.cards.find((c) => c.card === target) ?? null;
  const predicted = target === '__all__' ? row.cardsPerRun : (targetRow?.dropsPerRun ?? 0);
  const observable = runCount > 0 && dropCount >= 0 && predicted > 0;
  // 관측 장수 k의 상대 표준오차는 대략 1/√k
  const relError = dropCount > 0 ? 1 / Math.sqrt(dropCount) : null;

  /**
   * 관측 한 건으로는 스케일과 희소성을 동시에 정할 수 없다. 그래서 대상에 따라 나눈다.
   * - 전체 카드 수 관측 → 전역 스케일(지도당 카드 수)을 민다
   * - 희귀한 개별 카드 관측 → 희소성 지수 γ 를 역산한다 (스케일보다 γ 에 훨씬 민감하다)
   */
  const apply = () => {
    if (!observable) return;
    if (target === '__all__') {
      // 지도별 상대 드롭량과 몬스터 밀도 보정은 예측값에 이미 반영돼 있다
      onCalibrateScale((params.cardsPerRun * observedRate) / predicted);
      setResult(`지도당 카드 수를 ${round((params.cardsPerRun * observedRate) / predicted)}장으로 맞췄다`);
      return;
    }
    const gamma = onCalibrateGamma(target, observedRate);
    setResult(
      gamma === null
        ? '이 관측을 재현하는 γ가 조절 범위 밖이다. 이 카드만 고정하는 쪽이 낫다'
        : `희소성 지수 γ를 ${gamma.toFixed(2)}로 맞췄다. 다른 카드의 빈도도 함께 바뀐다`,
    );
  };

  /** 공식을 건드리지 않고 이 카드만 관측값으로 고정한다 */
  const pin = () => {
    if (!observable || target === '__all__' || observedRate <= 0) return;
    onPinRate(target, observedRate);
    setResult(`${ko(targetRow?.cardKo, target)} 를 ${frequency(1 / observedRate)} 로 고정했다`);
  };
  return (
    <div className="panel detail" style={{ marginTop: 0 }}>
      <h3>{ko(map.nameKo, map.name)}</h3>
      <div className="dim small">
        {map.name} · {map.tier}등급 · 지역 레벨 {row.effectiveAreaLevel}
        {row.effectiveAreaLevel !== map.areaLevel && (
          <span className="warnText"> (가정값, 원래 {map.areaLevel})</span>
        )}
        {map.boss && ` · 보스 ${ko(map.bossKo, map.boss)}`}
        {map.tileset && ` · ${ko(map.tilesetKo, map.tileset)}`}
      </div>

      <div className="grid2">
        <div className="stat">
          <div className="k">지도 1회당 기대 수익</div>
          <div className="v chaos">{chaos(row.evPerRun, divineChaos)}</div>
        </div>
        <div className="stat">
          <div className="k">시간당 (약 {round(row.minutesPerRun)}분/회)</div>
          <div className="v">{chaos(row.evPerHour, divineChaos)}</div>
        </div>
        <div className="stat">
          <div className="k">전용 카드 1장당 가치</div>
          <div className="v">{chaos(row.valuePerCard, divineChaos)}</div>
        </div>
        <div className="stat">
          <div className="k">예지 비용 / 회수</div>
          <div className="v">
            {row.scryingChaos === null ? (
              <span className="dim">-</span>
            ) : (
              <>
                {chaos(row.scryingChaos, divineChaos)}
                <span className="small dim">
                  {' '}· {paybackRuns(row.paybackRuns)} · {formatMinutes(row.paybackMinutes)}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="stat">
          <div className="k">몬스터 밀도 / 클리어 / 보스 난이도</div>
          <div className="v small">
            {map.mobCount ?? '-'} / {map.clearingAbility ?? '-'} / {map.bossDifficulty ?? '-'}
          </div>
        </div>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>점술 카드</th>
              <th className="num">시세</th>
              <th className="num">골드</th>
              <th className="num">드롭 빈도</th>
              <th className="num">기여</th>
              <th className="num">세트</th>
              <th>보상</th>
              <th className="num">24시간 거래</th>
              <th className="num">드롭 지역</th>
            </tr>
          </thead>
          <tbody>
            {row.cards.map((c) => (
              <tr key={c.card}>
                <td>
                  <CardLink name={ko(c.cardKo, c.card)} slug={c.slug} />
                  {c.noPrice && <span className="dim small" title="화폐 거래소에 시세 없음"> · 시세 없음</span>}
                </td>
                <td className="num chaos">
                  {c.noPrice ? <span className="dim">-</span> : chaos(c.chaos, divineChaos)}
                </td>
                <td className="num dim">
                  {c.measured ? (
                    <>
                      {c.measured.weight < 100
                        ? c.measured.weight.toFixed(1)
                        : Math.round(c.measured.weight).toLocaleString('ko-KR')}
                      {c.measured.source !== 'measured' && (
                        <span className="dim small" title="표본이 없어 추정한 값"> 추정</span>
                      )}
                      {c.measured.bossOnly && (
                        <span className="warnText small" title="보스에서만 나오는 카드. 일반 지역 드롭과 경로가 달라 추정이 특히 불확실하다"> 보스</span>
                      )}
                    </>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="num">
                  {frequency(c.runsPerDrop)}
                  {c.pinned && (
                    <button
                      className="linkBtn pinMark"
                      title="실측으로 고정된 값. 눌러서 해제"
                      onClick={() => onPinRate(c.card, null)}
                    >
                      실측
                    </button>
                  )}
                </td>
                <td className="num">
                  {percent(c.share)}
                  <div className="bar">
                    <span style={{ width: `${Math.min(c.share * 100, 100)}%` }} />
                  </div>
                </td>
                <td className="num dim">{c.stackSize ?? '-'}</td>
                <td className="small dim">{c.rewardKo ?? c.reward ?? '-'}</td>
                <td className="num dim">{c.volume ? c.volume.toLocaleString('ko-KR') : '-'}</td>
                <td className="num dim" title="이 카드가 드롭되는 지역 수">{c.areaCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="calib">
        <span className="small dim">실측 보정</span>
        <select
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setResult(null);
          }}
          style={{ width: 'auto' }}
        >
          <option value="__all__">전용 카드 전체</option>
          {row.cards.map((c) => (
            <option key={c.card} value={c.card}>
              {ko(c.cardKo, c.card)}
            </option>
          ))}
        </select>
        <input
          type="number" min={1} placeholder="돌린 횟수" value={runs}
          onChange={(e) => {
            setRuns(e.target.value);
            setResult(null);
          }}
        />
        <span className="small dim">회 돌려</span>
        <input
          type="number" min={0} placeholder="먹은 장수" value={drops}
          onChange={(e) => {
            setDrops(e.target.value);
            setResult(null);
          }}
        />
        <span className="small dim">장</span>
        <button disabled={!observable} onClick={apply}>
          {target === '__all__' ? '지도당 카드 수 보정' : 'γ 맞추기'}
        </button>
        {target !== '__all__' && (
          <button disabled={!observable || observedRate <= 0} onClick={pin}>
            이 카드만 고정
          </button>
        )}
        <span className="small dim">
          {result ??
            (observable
              ? `현재 예측 ${frequency(1 / predicted)} → 관측 ${frequency(runCount / Math.max(dropCount, 1))}` +
                (relError ? ` · 표본 ${dropCount}장, 오차 ±${Math.round(relError * 100)}%` : '') +
                (target === '__all__' ? ' · 지도당 카드 수를 맞춘다' : ' · 희소성 지수 γ를 맞춘다')
              : target === '__all__'
                ? `위 표의 점술 카드 ${row.poolSize}종만 세고, 아무 지도에서나 나오는 카드는 제외할 것`
                : '희귀한 카드일수록 γ 추정에 유리하다. 점술 카드 갑충석·아틀라스 특성을 쓴 판이면 실제보다 후하게 잡힌다')}
        </span>
      </div>

      {row.locked.length > 0 && (
        <p className="small dim" style={{ marginTop: 10 }}>
          🔒 지역 레벨이 낮아 드롭되지 않는 카드:{' '}
          {row.locked.map((l, i) => (
            <span key={l.card}>
              {i > 0 && ', '}
              <CardLink name={ko(l.cardKo, l.card)} slug={l.slug} />
              {` (레벨 ${l.requiredLevel}${l.chaos ? `, ${chaos(l.chaos, divineChaos)}` : ''})`}
            </span>
          ))}
        </p>
      )}

      <p className="small dim" style={{ marginTop: 10 }}>
        지형 — 장애물 적음 {layoutLabel(map.layout.fewObstacles)} · 직선형 {layoutLabel(map.layout.linear)} ·
        야외 {layoutLabel(map.layout.outdoors)} · 보스 별도 방 아님 {layoutLabel(map.layout.bossNotInOwnRoom)}
        {map.linked.length > 0 && <> · 인접 지도: {(map.linkedKo.length ? map.linkedKo : map.linked).join(', ')}</>}
      </p>
    </div>
  );
}
