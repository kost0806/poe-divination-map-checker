import type { MapEv } from '../../shared/ev';
import { chaos, frequency, percent, round } from '../lib/format';

interface Props {
  row: MapEv;
  divineChaos: number;
}

const layoutLabel = (v: boolean | null) => (v === null ? '-' : v ? '예' : '아니오');

export function MapDetail({ row, divineChaos }: Props) {
  const { map } = row;
  return (
    <div className="panel detail" style={{ marginTop: 0 }}>
      <h3>{map.name}</h3>
      <div className="dim small">
        T{map.tier} · 지역 레벨 {row.effectiveAreaLevel}
        {row.effectiveAreaLevel !== map.areaLevel && <span className="warnText"> (가정값, 고유 {map.areaLevel})</span>}
        {map.boss && ` · 보스 ${map.boss}`}
        {map.tileset && ` · ${map.tileset}`}
      </div>

      <div className="grid2">
        <div className="stat">
          <div className="k">맵 1회당 기대수익</div>
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
          <div className="k">몹 밀도 / 클리어 / 보스</div>
          <div className="v small">
            {map.mobCount ?? '-'} / {map.clearingAbility ?? '-'} / {map.bossDifficulty ?? '-'}
          </div>
        </div>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>카드</th>
              <th className="num">시세</th>
              <th className="num">골드</th>
              <th className="num">드랍 빈도</th>
              <th className="num">기여</th>
              <th className="num">스택</th>
              <th>보상</th>
              <th className="num">24h 거래</th>
              <th className="num">지역</th>
            </tr>
          </thead>
          <tbody>
            {row.cards.map((c) => (
              <tr key={c.card}>
                <td>
                  {c.card}
                  {c.noPrice && <span className="dim small" title="커런시 익스체인지에 시세 없음"> · 시세없음</span>}
                </td>
                <td className="num chaos">{chaos(c.chaos, divineChaos)}</td>
                <td className="num dim">{c.goldFee ?? '-'}</td>
                <td className="num">{frequency(c.runsPerDrop)}</td>
                <td className="num">
                  {percent(c.share)}
                  <div className="bar">
                    <span style={{ width: `${Math.min(c.share * 100, 100)}%` }} />
                  </div>
                </td>
                <td className="num dim">{c.stackSize ?? '-'}</td>
                <td className="small dim">{c.reward ?? '-'}</td>
                <td className="num dim">{c.volume ? c.volume.toLocaleString('ko-KR') : '-'}</td>
                <td className="num dim" title="이 카드가 드랍되는 지역 수">{c.areaCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {row.locked.length > 0 && (
        <p className="small dim" style={{ marginTop: 10 }}>
          🔒 지역 레벨 부족으로 잠긴 카드:{' '}
          {row.locked
            .map((l) => `${l.card} (lv${l.requiredLevel}${l.chaos ? `, ${chaos(l.chaos, divineChaos)}` : ''})`)
            .join(', ')}
        </p>
      )}

      <p className="small dim" style={{ marginTop: 10 }}>
        레이아웃 — 장애물 적음 {layoutLabel(map.layout.fewObstacles)} · 직선형 {layoutLabel(map.layout.linear)} ·
        야외 {layoutLabel(map.layout.outdoors)} · 보스 별도방 아님 {layoutLabel(map.layout.bossNotInOwnRoom)}
        {map.linked.length > 0 && <> · 인접 맵: {map.linked.join(', ')}</>}
      </p>
    </div>
  );
}
