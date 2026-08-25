import { useState } from 'react';
import type { MapEv } from '../../shared/ev';
import { chaos, frequency, indexValue, percent, round } from '../lib/format';
import { ko, poedbUrl } from '../lib/names';

interface Props {
  row: MapEv;
  divineChaos: number;
  /** 특정 카드의 드롭 빈도를 관측값으로 고정하거나(값 지정), 해제한다(null) */
  onPinRate: (card: string, dropsPerMap: number | null) => void;
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

export function MapDetail({ row, divineChaos, onPinRate }: Props) {
  const { map } = row;
  const [target, setTarget] = useState('');
  const [maps, setMaps] = useState('');
  const [drops, setDrops] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const mapCount = Number(maps);
  const dropCount = Number(drops);
  const observedRate = mapCount > 0 ? dropCount / mapCount : 0;
  const targetRow = row.cards.find((c) => c.card === target) ?? null;
  const canPin = target !== '' && mapCount > 0 && observedRate > 0;
  // 관측 장수 k의 상대 표준오차는 대략 1/√k
  const relError = dropCount > 0 ? 1 / Math.sqrt(dropCount) : null;

  const pin = () => {
    if (!canPin) return;
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
          <div className="k">기대 지표</div>
          <div className="v chaos">{indexValue(row.index)}</div>
        </div>
        <div className="stat">
          <div className="k">예지 비용</div>
          <div className="v">
            {row.scryingChaos === null ? <span className="dim">-</span> : chaos(row.scryingChaos, divineChaos)}
          </div>
        </div>
        <div className="stat">
          <div className="k">회수 (예지 비용 ÷ 지표)</div>
          <div className="v">
            {row.paybackIndex === null ? <span className="dim">-</span> : round(row.paybackIndex)}
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
              <th className="num" title="커뮤니티 실측 드롭 가중치 (Rain of Chaos = 121,400)">가중치</th>
              <th className="num" title="카드가 드롭됐을 때 이 카드일 확률">확률</th>
              <th className="num">드롭 빈도</th>
              <th className="num">기여</th>
              <th className="num">세트</th>
              <th>보상</th>
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
                      {c.bossOnly && (
                        <span className="warnText small" title="보스에서만 나오는 카드"> 보스</span>
                      )}
                    </>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="num dim" title="카드가 드롭됐을 때 이 카드일 확률">
                  {c.probability > 0 ? `1/${Math.round(1 / c.probability).toLocaleString('ko-KR')}` : '-'}
                </td>
                <td className="num">
                  {frequency(c.mapsPerDrop)}
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
                <td className="num dim" title="이 카드가 드롭되는 지역 수">{c.areaCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="calib">
        <span className="small dim">실측 고정</span>
        <select
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setResult(null);
          }}
          style={{ width: 'auto' }}
        >
          <option value="">카드 선택</option>
          {row.cards.map((c) => (
            <option key={c.card} value={c.card}>
              {ko(c.cardKo, c.card)}
            </option>
          ))}
        </select>
        <input
          type="number" min={1} placeholder="돌린 판수" value={maps}
          onChange={(e) => { setMaps(e.target.value); setResult(null); }}
        />
        <span className="small dim">판 돌려</span>
        <input
          type="number" min={0} placeholder="먹은 장수" value={drops}
          onChange={(e) => { setDrops(e.target.value); setResult(null); }}
        />
        <span className="small dim">장</span>
        <button disabled={!canPin} onClick={pin}>이 카드 고정</button>
        <span className="small dim">
          {result ??
            (canPin
              ? `현재 예측 ${frequency(targetRow?.mapsPerDrop ?? Infinity)} → 관측 ${frequency(mapCount / Math.max(dropCount, 1))}` +
                (relError ? ` · 표본 ${dropCount}장, 오차 ±${Math.round(relError * 100)}%` : '')
              : '공식이 체감과 다른 카드를 직접 관측값으로 덮어쓴다. 보스 카드처럼 추정이 불확실한 경우에 쓸 것')}
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
