import type { MapEv } from '../../shared/ev';
import { chaos, round } from '../lib/format';
import { ko, shortMapName } from '../lib/names';

interface Props {
  rows: MapEv[];
  divineChaos: number;
  selected: string | null;
  favourites: Set<string>;
  onSelect: (slug: string) => void;
  onToggleFavourite: (slug: string) => void;
}

export function MapTable({ rows, divineChaos, selected, favourites, onSelect, onToggleFavourite }: Props) {
  const max = rows.reduce((a, r) => Math.max(a, r.evPerRun), 0);

  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: 28 }}></th>
            <th className="num" style={{ width: 34 }}>#</th>
            <th>지도</th>
            <th style={{ width: 52 }}>등급</th>
            <th className="num">1회당</th>
            <th className="num">시간당</th>
            <th className="num">카드/회</th>
            <th>주력 점술 카드</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.map.slug}
              className={`clickable${selected === row.map.slug ? ' selected' : ''}`}
              onClick={() => onSelect(row.map.slug)}
            >
              <td>
                <button
                  className={`fav${favourites.has(row.map.slug) ? ' on' : ''}`}
                  title="선호 지도로 표시"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavourite(row.map.slug);
                  }}
                >
                  {favourites.has(row.map.slug) ? '★' : '☆'}
                </button>
              </td>
              <td className="num rank">{i + 1}</td>
              <td>
                {shortMapName(row.map.nameKo, row.map.name)}
                {row.locked.length > 0 && (
                  <span className="dim small" title={`지역 레벨이 낮아 드롭되지 않는 카드 ${row.locked.length}종`}>
                    {' '}🔒{row.locked.length}
                  </span>
                )}
                <div className="bar">
                  <span style={{ width: `${max > 0 ? (row.evPerRun / max) * 100 : 0}%` }} />
                </div>
              </td>
              <td>
                <span className="tier">{row.map.tier}</span>
              </td>
              <td className="num chaos">{chaos(row.evPerRun, divineChaos)}</td>
              <td className="num">{chaos(row.evPerHour, divineChaos)}</td>
              <td className="num dim">{round(row.cardsPerRun)}</td>
              <td className="small">
                {row.cards[0] ? (
                  <>
                    {ko(row.cards[0].cardKo, row.cards[0].card)}{' '}
                    <span className="dim">
                      {chaos(row.cards[0].chaos, divineChaos)} · 기여 {(row.cards[0].share * 100).toFixed(0)}%
                    </span>
                  </>
                ) : (
                  <span className="dim">드롭 가능한 카드 없음</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="dim" style={{ padding: 16 }}>조건에 맞는 지도이 없습니다.</p>}
    </div>
  );
}
