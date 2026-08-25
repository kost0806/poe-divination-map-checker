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
      <p>
        <b>아틀라스에 올라 있어 예지할 수 있는 지도만 다룬다.</b> 다음은 선호 지도로 지정할 수 없어 뺐다 —
        17등급 지도(성역·성채·요새·흉물·지구라트), 쉐이퍼 수호자 지도(키메라의 구덩이·히드라의 소굴·
        미노타우로스의 미로·불사조의 대장간), 바알 사원 지도, 자나 기억으로만 들어가는 지도(허비의 안뜰·
        부정의 석실·거짓의 극장), 그리고 고유 지도. 반면 지도 아이템에 붙는 인챈트("지도가 태초자의 영향을
        받음" 등)는 지도 베이스가 아니라 카드 풀을 바꾸지 않으므로 같은 이름의 지도로 보면 되고, 엘더
        수호자도 일반 지도에 영향력이 걸려 등장할 뿐 별도 지도가 아니다.
      </p>

      <h2>드롭률을 어떻게 구했나</h2>
      <p>
        GGG는 카드별 드롭 확률을 공개하지 않는다. 게임 클라이언트 데이터(dat) 1535개 테이블에도 카드 단위
        가중치는 없다. 대신 커뮤니티가 <b>스택된 덱을 대량으로 개봉해 실측한 가중치 표</b>가 있다.
        스택된 덱은 전역 카드 가중치 표에서 무작위로 한 장을 뽑으므로, 여기서 나온 분포가 곧 카드별
        상대 드롭 가중치다. 지도 선호도나 거래 유동성 같은 편향이 원천적으로 끼어들 수 없다.
      </p>
      <table>
        <tbody>
          <tr><th>출처</th><td>
            <a href="https://divicards-site.pages.dev/" target="_blank" rel="noreferrer noopener">Divicards</a> /
            Divcord 커뮤니티 가중치 스프레드시트
          </td></tr>
          <tr><th>집계 표본</th><td>{dataset.static.weights ? `스택된 덱 ${dataset.static.weights.totalSamples.toLocaleString('ko-KR')}개 개봉 (패치 ${dataset.static.weights.patches[0]}~${dataset.static.weights.patches.at(-1)})` : '-'}</td></tr>
          <tr><th>척도</th><td>Rain of Chaos(카오스의 비) = 121,400 기준</td></tr>
          <tr><th>수록 카드</th><td>{dataset.static.weights ? `${dataset.static.weights.cards.length}종 (실측 ${dataset.static.weights.cards.filter((c) => c.source === 'measured').length}종)` : '-'}</td></tr>
        </tbody>
      </table>
      <p>
        표본이 0인 카드는 그 사실 자체가 상한을 준다. 관측 0회의 95% 상한이 3/N 이므로 가중치는
        {dataset.static.weights ? ` ${dataset.static.weights.detectionBound.toFixed(2)} ` : ' '}
        미만이고, 이 상한과 골드 수수료 회귀 추정치 중 작은 값을 쓴다. 표에 없는 신규 카드는 골드 회귀로
        채운다{dataset.static.weights ? ` (가중치 ∝ 골드^${dataset.static.weights.goldFit.exponent.toFixed(2)}, R²=${dataset.static.weights.goldFit.r2.toFixed(2)}, n=${dataset.static.weights.goldFit.samples})` : ''}.
        카드 표의 가중치 옆에 <b>추정</b> 표시가 붙은 것이 이 경우다.
      </p>

      <h2>보스 전용 카드는 따로 봐야 한다</h2>
      <p>
        일부 카드는 지역 몬스터가 아니라 <b>지도 보스에서만</b> 나온다(천벌, 아버지의 사랑, 기적 등).
        이런 카드는 스택된 덱 표본에서도 거의 잡히지 않아 가중치가 검출 상한에 걸린다. 드롭 경로 자체가
        다르므로 여기 숫자는 특히 불확실하다. 카드 표에 <b>보스</b> 표시로 구분해 두었으니, 직접 관측한
        빈도가 있으면 실측 보정으로 고정해서 쓰는 편이 낫다.
      </p>
      <p>
        이 프로젝트가 처음에는 골드 수수료를 희소성 지표로 썼는데, 실제 파밍 관측치와 맞지 않았다.
        천벌(골드 1350)과 약제사(골드 1100)는 골드가 1.23배 차이인데 체감 빈도는 십수 배 차이가 났다.
        실측 가중치를 확보하고 나서야 이유가 드러났다 — 천벌은 보스 전용 카드라 애초에 다른 경로였고,
        골드와 가중치의 관계도 지수 1이 아니라 2.35였다. 골드 기반 추정은 선택지로 남겨 두었다.
      </p>

      <h2>예지 비용 회수</h2>
      <p>
        예지의 오브는 화폐 거래소에서 거래되지 않아 인게임 시세가 없다. 그래서 지도별 시세는
        poe.ninja 가 문서에서 지원 대상으로 명시한 economy 엔드포인트(<code>ScryingOrb</code>)에서 받아온다.
        지침대로 서버 쪽에서만 호출하고 응답 캐시를 존중하며, 원본이 15분 주기로 갱신되므로 그보다 자주
        조회하지 않는다.
      </p>
      <pre>{`회수 판수 = 예지의 오브 시세 ÷ 지도 1회당 기대 수익
회수 시간 = 회수 판수 × 지도 1회 소요 시간`}</pre>
      <p>
        점술 카드 수익만 놓고 본전을 맞추는 데 필요한 판수다. 지도에서 나오는 다른 수익(화폐, 장비,
        아틀라스 진행)은 계산에 넣지 않았으므로 실제 회수는 이보다 빠르다. 참고로 예지의 오브 시세가
        붙은 지도는 정확히 100개이고, 이 앱이 비교 대상에서 뺀 13개 지도에는 예지의 오브 자체가 없다.
      </p>

      <h2>어느 등급으로 돈다고 보나</h2>
      <p>
        기본값은 <b>공허석 4개를 낀 상태</b>다. 이 경우 아틀라스의 모든 지도가 16등급(지역 레벨 83)이
        되므로 지도 고유 등급과 무관하게 전용 카드가 전부 드롭 대상이 된다. 실제로 카드 드롭 레벨은
        최대 82라서 이 상태에서 잠기는 카드는 하나도 없다. 17등급 지도는 원래 레벨(84)을 유지한다.
      </p>
      <p>
        공허석이 없는 상태를 보려면 "공허석 없음"을 고르면 된다. 그 경우 저등급 지도에서는 드롭 레벨이
        높은 카드가 잠기고(113개 중 56개 지도), 잠긴 카드는 기대 수익 계산에서 완전히 빠진다. 예를 들어
        묘지 지도는 1등급이라 천벌(드롭 레벨 81)이 나오지 않아 순위가 108위까지 내려간다.
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
            <td>지도별 예지의 오브 시세</td>
            <td>
              <a href="https://poe.ninja/docs/api" target="_blank" rel="noreferrer noopener">
                poe.ninja 공개 economy API
              </a>
            </td>
            <td>{dataset.scrying?.prices.length ?? 0}종</td>
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
