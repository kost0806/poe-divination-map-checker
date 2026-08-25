import type { Calibration, Dataset } from '../../shared/types';
import { ko, shortMapName } from '../lib/names';

interface Props {
  dataset: Dataset;
}

export function Methodology({ dataset }: Props) {
  const cal: Calibration | null = dataset.calibration;
  const cardKo = new Map(dataset.static.cards.map((c) => [c.name, c.nameKo]));
  const areaKo = new Map(dataset.static.areas.map((a) => [a.name, a.nameKo]));
  const mapCount = dataset.static.areas.filter((a) => a.isMap).length;
  const pairCount = dataset.static.areas
    .filter((a) => a.isMap)
    .reduce((a, area) => a + area.cards.length, 0);

  return (
    <div className="prose">
      <h2>무엇을 계산하나</h2>
      <p>
        아틀라스의 지도마다 <b>그 지도에서만 나오는 전용 점술 카드</b>의 기대 수익을 계산해 지도끼리
        비교한다. 선호 지도 슬롯에 무엇을 넣을지 정하는 것이 목적이므로, 어느 지도에서나 나오는 카드는
        모든 지도에 똑같이 얹히는 값이라 제외했다.
      </p>

      <h2>드롭률을 어떻게 추정했나</h2>
      <p>
        GGG는 카드별 드롭 확률을 공개하지 않는다. 게임 클라이언트 데이터(dat) 1535개 테이블을 확인했지만
        카드 단위 가중치 테이블은 없고 그룹 단위 <code>DropPool</code>만 존재한다. 24시간 거래량으로
        역산하는 것도 불가능하다 — <code>거래량 = 드롭률 × Σ(그 카드가 나오는 지도들의 실행 횟수)</code> 라서
        지도 선호도와 드롭률이 분리되지 않는다(미지수가 방정식보다 많아 식별 불가).
      </p>
      <p>
        대신 <b>화폐 거래소(Currency Exchange)의 골드 수수료</b>
        (<code>CurrencyExchange.GoldPurchaseFee</code>)를 쓴다. GGG가 아이템마다 직접 매긴 고정값이라
        시장 시세나 지도 선호도와 무관하다.
        예: 카오스의 비 5 · 학자 15 · 마녀 40 · 의사 925 · 거울의 집 1850.
      </p>
      <p>
        검증 방법: <b>한 지도에서만 드롭되는 카드들</b>끼리는 그 지도의 실행 횟수가 공통이라 약분되므로,
        이들의 거래량 비율은 상대 드롭률의 불편추정치가 된다. 지도별로 중심화한 뒤 회귀하면
      </p>
      {cal ? (
        <table>
          <tbody>
            <tr><th>회귀식</th><td>log(24시간 거래량) ~ log(골드 수수료)</td></tr>
            <tr><th>기울기</th><td>{(-cal.gamma).toFixed(3)} → <b>γ = {cal.gamma.toFixed(3)}</b></td></tr>
            <tr><th>결정계수</th><td>R² = {cal.r2.toFixed(3)}</td></tr>
            <tr><th>표본</th><td>지도 전용 카드 {cal.samples}종 / {cal.maps}개 지도</td></tr>
          </tbody>
        </table>
      ) : (
        <p className="dim">표본이 부족해 회귀를 계산하지 못했다.</p>
      )}
      <p>
        즉 드롭률이 골드 수수료에 거의 정확히 반비례한다. 카드 c의 절대 드롭률을
        <code> A · 골드<sub>c</sub><sup>-γ</sup></code> 로 둔다.
      </p>

      <h2>계산식</h2>
      <pre>{`대상(m) = { 지도 m 전용 점술 카드 c : c의 드롭 레벨 ≤ 지도 m 지역 레벨 }

S_m = Σ 골드_c^(-γ)                  지도 m의 상대 카드 드롭량
E_m = Σ 골드_c^(-γ) × 시세_c          지도 m의 상대 기대 수익  ← 지도 간 순위 기준

A          = 지도당 카드 수 가정 ÷ 전체 지도 평균 S    (모든 지도 공통 상수)
카드 수/회  = A × S_m × (몬스터 밀도_m / 평균)
1회당 수익  = A × E_m × (몬스터 밀도_m / 평균)
소요 분_m   = 기준 시간 × (평균 클리어 / 클리어_m)
시간당 수익 = 1회당 수익 × 60 / 소요 분_m`}</pre>
      <p>
        <code>A</code>는 모든 지도에 동일하게 곱해지므로 <b>지도 간 순위에는 영향이 없다.</b> 카오스
        절대값을 읽을 때만 의미가 있고, 그 값은 "평균 지도 1회당 전용 카드가 몇 장 나오는가"라는 가정에
        달려 있다.
      </p>

      <h2>한계</h2>
      <ul>
        <li>
          <b>절대 수익은 가정값이다.</b> 지도 1회당 카드가 몇 장 드롭되는지는 공개 데이터가 없다. 지도 간
          순위와 배율은 유효하지만 "1회당 몇 카오스"라는 숫자 자체는 가정에 의존한다. 지도 상세의
          실측 보정으로 직접 맞출 수 있다.
        </li>
        <li>
          <b>γ는 과소추정 쪽으로 편향된다.</b> 거래량이 0인 카드는 회귀에서 빠지는데 그런 카드는 대개 흔한
          저가 카드다. 즉 표본이 희귀한 카드 쪽으로 잘려 있어 실제 γ는 추정치보다 클 가능성이 높다.
          체감보다 희귀한 카드가 후하게 잡힌다면 γ를 올려서 보면 된다.
        </li>
        <li>
          <b>아틀라스 특성·갑충석·지도 접두어를 반영하지 않는다.</b> 점술 카드에는 전용 스탯이 따로
          있어서(예: 갑충석의 "지역 내 점술 카드를 떨어뜨릴 확률이 1000% 증가") 투자 여부에 따라 절대량이
          몇 배씩 달라진다. 여기 값은 그런 투자 없이 지도 자체만 비교한 기준선이다. 실측 보정에 넣는
          관측치도 같은 조건에서 나온 것이어야 한다.
        </li>
        <li>
          <b>시세는 인게임 화폐 거래소 기준</b>이다. 거래 게시판 호가와 다를 수 있고, 거래량이 적은
          카드는 시세 자체가 불안정하다.
        </li>
        <li>
          <b>지도 접두어의 아이템 희귀도가 카드에 영향을 주는지는 확정할 수 없다.</b> 게임 데이터상 카드
          드롭은 아이템 희귀도와 별개의 전용 스탯으로 제어되고, 희귀도 모드 문구는 카드를 언급하지 않는다.
          다만 공개 데이터로 "영향이 없다"를 증명할 수는 없다.
        </li>
        <li>몬스터 밀도·클리어 속도는 PoEDB의 1~10 정성 평가라 실제 클리어 속도와 완전히 일치하지 않는다.</li>
      </ul>

      <h2>데이터 출처</h2>
      <table>
        <thead>
          <tr><th>항목</th><th>출처</th><th>규모</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>지도별 전용 점술 카드 / 카드 드롭 레벨</td>
            <td>PoEDB (게임 클라이언트 데이터)</td>
            <td>{mapCount}개 지도 / {pairCount}쌍</td>
          </tr>
          <tr>
            <td>카드 골드 수수료 · 세트 장수 · 보상</td>
            <td>PoEDB</td>
            <td>{dataset.static.cards.length}종</td>
          </tr>
          <tr>
            <td>카드 시세 · 24시간 거래량</td>
            <td>인게임 화폐 거래소</td>
            <td>{dataset.prices.prices.length}종</td>
          </tr>
          <tr>
            <td>지도 등급 · 지역 레벨 · 몬스터 밀도 · 클리어 속도</td>
            <td>PoEDB</td>
            <td>{dataset.static.maps.length}개 지도</td>
          </tr>
          <tr>
            <td>현재 리그</td>
            <td>pathofexile.com 공식 API</td>
            <td>{dataset.league?.id ?? '-'}</td>
          </tr>
        </tbody>
      </table>

      {cal && cal.points.length > 0 && (
        <>
          <h2>γ 회귀에 쓰인 표본</h2>
          <div className="tableWrap">
            <table>
              <thead>
                <tr><th>점술 카드</th><th>지도</th><th className="num">골드</th><th className="num">시세(카오스)</th><th className="num">24시간 거래량</th></tr>
              </thead>
              <tbody>
                {[...cal.points]
                  .sort((a, b) => b.gold - a.gold)
                  .map((p) => (
                    <tr key={`${p.map}-${p.card}`}>
                      <td>{ko(cardKo.get(p.card), p.card)}</td>
                      <td className="dim">{shortMapName(areaKo.get(p.map), p.map)}</td>
                      <td className="num">{p.gold}</td>
                      <td className="num">{p.chaos.toFixed(1)}</td>
                      <td className="num">{p.volume.toLocaleString('ko-KR')}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
