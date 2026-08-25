import type { Calibration, Dataset } from '../../shared/types';

interface Props {
  dataset: Dataset;
}

export function Methodology({ dataset }: Props) {
  const cal: Calibration | null = dataset.calibration;
  const mapCount = dataset.static.areas.filter((a) => a.isMap).length;
  const pairCount = dataset.static.areas
    .filter((a) => a.isMap)
    .reduce((a, area) => a + area.cards.length, 0);

  return (
    <div className="prose">
      <h2>무엇을 계산하나</h2>
      <p>
        아틀라스 맵마다 <b>그 맵에서만 나오는 전용 디비네이션 카드</b>의 기대수익을 계산해 맵끼리 비교한다.
        선호 지도 슬롯에 뭘 넣을지 정하는 것이 목적이므로, 어느 맵에서나 나오는 전역 풀 카드는 모든 맵에
        똑같이 얹히는 값이라 제외했다.
      </p>

      <h2>드랍률을 어떻게 추정했나</h2>
      <p>
        GGG는 카드별 드랍 확률을 공개하지 않는다. 게임 클라이언트 데이터(dat) 1535개 테이블을 확인했지만
        카드 단위 가중치 테이블은 없고, 그룹 단위 <code>DropPool</code>만 존재한다. 24시간 거래량으로
        역산하는 것도 불가능하다 — <code>거래량 = 드랍률 × Σ(그 카드가 나오는 맵들의 실행 횟수)</code> 라서
        맵 인기도와 드랍률이 분리되지 않는다(미지수가 방정식보다 많아 식별 불가).
      </p>
      <p>
        대신 <b>커런시 익스체인지 골드 수수료</b>(<code>CurrencyExchange.GoldPurchaseFee</code>)를 쓴다.
        GGG가 아이템마다 직접 매긴 정적 값이라 시장 시세나 맵 인기도와 무관하다.
        예: Rain of Chaos 5 · The Witch 40 · The Doctor 925 · House of Mirrors 1850.
      </p>
      <p>
        검증 방법: <b>한 맵에서만 드랍되는 카드들</b>끼리는 그 맵의 실행 횟수가 공통이라 약분되므로, 이들의
        거래량 비율은 상대 드랍률의 불편추정치가 된다. 맵별로 중심화한 뒤 회귀하면
      </p>
      {cal ? (
        <table>
          <tbody>
            <tr><th>회귀식</th><td>log(24h 거래량) ~ log(골드 수수료)</td></tr>
            <tr><th>기울기</th><td>{(-cal.gamma).toFixed(3)} → <b>γ = {cal.gamma.toFixed(3)}</b></td></tr>
            <tr><th>결정계수</th><td>R² = {cal.r2.toFixed(3)}</td></tr>
            <tr><th>표본</th><td>맵 전용 카드 {cal.samples}종 / {cal.maps}개 맵</td></tr>
          </tbody>
        </table>
      ) : (
        <p className="dim">표본이 부족해 회귀를 계산하지 못했다.</p>
      )}
      <p>
        즉 드랍률이 골드 수수료에 거의 정확히 반비례한다. 카드 c의 절대 드랍률을
        <code> A · 골드<sub>c</sub><sup>-γ</sup></code> 로 둔다.
      </p>

      <h2>계산식</h2>
      <pre>{`pool(m) = { 맵 m 전용 카드 c : c.dropLevel ≤ 맵 m 지역레벨 }

S_m = Σ 골드_c^(-γ)                    맵 m의 상대 카드 드랍량
E_m = Σ 골드_c^(-γ) × 시세_c            맵 m의 상대 기대수익  ← 맵 간 순위 기준

A          = 맵당 카드수 가정 ÷ 전체 맵 평균 S       (모든 맵 공통 상수)
카드수/회   = A × S_m × (몹밀도_m / 평균)
1회당 수익  = A × E_m × (몹밀도_m / 평균)
소요분_m    = 기준시간 × (평균클리어 / 클리어_m)
시간당 수익 = 1회당 수익 × 60 / 소요분_m`}</pre>
      <p>
        <code>A</code>는 모든 맵에 동일하게 곱해지므로 <b>맵 간 순위에는 영향이 없다.</b> 절대 카오스 값을
        읽을 때만 의미가 있고, 그 값은 "평균 맵 1회당 전용 카드 몇 장이 나오는가"라는 가정에 달려 있다.
      </p>

      <h2>한계</h2>
      <ul>
        <li>
          <b>절대 수익은 가정값이다.</b> 맵 1회당 카드가 몇 장 드랍되는지는 공개 데이터가 없다. 맵 간 순위와
          배율은 유효하지만, "1회당 몇 카오스"라는 숫자 자체는 스케일 가정에 의존한다.
        </li>
        <li>
          <b>γ는 과소추정 쪽으로 편향된다.</b> 거래량이 0인 카드는 회귀에서 빠지는데 그런 카드는 대개 흔한
          저가 카드다. 즉 표본이 희귀 카드 쪽으로 잘려 있어 실제 γ는 추정치보다 클 가능성이 높다.
          체감보다 희귀 카드가 후하게 잡힌다면 γ를 올려서 보면 된다.
        </li>
        <li>
          <b>아틀라스 패시브·스캐럽·맵 접두어를 반영하지 않는다.</b> 실제 파밍에서는 디비네이션 카드 관련
          아틀라스 투자가 수익을 크게 바꾼다. 여기 값은 그런 투자 없이 맵 자체만 비교한 것이다.
        </li>
        <li>
          <b>시세는 인게임 커런시 익스체인지 기준</b>이다. 거래 게시판 호가와 다를 수 있고, 거래량이 적은
          카드는 시세 자체가 불안정하다.
        </li>
        <li>몹 밀도·클리어 지표는 PoEDB의 1~10 정성 평가라 실제 클리어 속도와 완전히 일치하지 않는다.</li>
      </ul>

      <h2>데이터 출처</h2>
      <table>
        <thead>
          <tr><th>항목</th><th>출처</th><th>규모</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>맵별 전용 카드 풀 / 카드 DropLevel</td>
            <td>PoEDB (게임 클라이언트 데이터)</td>
            <td>{mapCount}개 맵 / {pairCount}쌍</td>
          </tr>
          <tr>
            <td>카드 골드 수수료 · 스택 · 보상</td>
            <td>PoEDB</td>
            <td>{dataset.static.cards.length}종</td>
          </tr>
          <tr>
            <td>카드 시세 · 24h 거래량</td>
            <td>인게임 커런시 익스체인지</td>
            <td>{dataset.prices.prices.length}종</td>
          </tr>
          <tr>
            <td>맵 티어 · 지역 레벨 · 몹 밀도 · 클리어 지표</td>
            <td>PoEDB</td>
            <td>{dataset.static.maps.length}개 맵</td>
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
                <tr><th>카드</th><th>맵</th><th className="num">골드</th><th className="num">시세(c)</th><th className="num">24h 거래량</th></tr>
              </thead>
              <tbody>
                {[...cal.points]
                  .sort((a, b) => b.gold - a.gold)
                  .map((p) => (
                    <tr key={`${p.map}-${p.card}`}>
                      <td>{p.card}</td>
                      <td className="dim">{p.map.replace(/ Map$/, '')}</td>
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
