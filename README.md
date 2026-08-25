# poe-divination-map-checker

> **Notice — personal project, not for public release**
>
> This is a personal tool I built for my own use while playing. It is not a product, it is not
> released, and there are no plans to publish, promote, or distribute it to other players.
>
> The repository is public solely so that this can be stated openly and verified. In particular,
> it lets the operators of the data sources this project reads — [PoEDB](https://poedb.tw) and
> [poe.ninja](https://poe.ninja) — see exactly what the code fetches, how often, from which
> documented endpoints, and with what caching and User-Agent. Publishing the source is a
> transparency measure, not a distribution channel.
>
> Not affiliated with or endorsed by Grinding Gear Games, PoEDB, or poe.ninja.

Path of Exile 아틀라스 **지도별 점술 카드 기대 수익** 계산기.

현재 리그의 화폐 거래소(Currency Exchange) 시세와 게임 데이터를 결합해, 지도마다 어떤
점술 카드가 얼마나 나오고 그게 얼마어치인지 추정한다. 선호 지도를 무엇으로 채울지 정하는 것이 목적이다.

아틀라스에 올라 있어 예지할 수 있는 지도만 비교한다. 17등급 지도, 쉐이퍼 수호자 지도, 바알 사원 지도,
자나 기억으로만 들어가는 지도, 고유 지도는 제외한다. 지도 아이템 인챈트("지도가 태초자의 영향을 받음" 등)는
카드 풀을 바꾸지 않아 목록에 영향을 주지 않는다.

## 데이터 출처

| 항목 | 출처 | 갱신 주기 |
|---|---|---|
| 지도별 전용 점술 카드 / 카드 드롭 레벨 | PoEDB (게임 클라이언트 데이터) | 패치 단위 |
| **카드별 실측 드롭 가중치** | [Divicards](https://divicards-site.pages.dev/) / Divcord 커뮤니티 스프레드시트 | 패치 단위 |
| 카드 골드 수수료 (`CurrencyExchange.GoldPurchaseFee`) | PoEDB | 패치 단위 |
| 지도 등급 / 지역 레벨 / 몬스터 밀도 / 클리어 속도 | PoEDB | 패치 단위 |
| 카드 시세 · 24시간 거래량 | 인게임 화폐 거래소 (PoEDB 미러) | 상시 |
| 현재 리그 | pathofexile.com 공식 API | 상시 |

패치 단위 데이터는 `npm run data:build` 로 크롤해 `data/static.json` 에 커밋해 두고,
시세만 런타임에 갱신한다. 시세 조회가 실패하면 `data/prices.json` 스냅샷으로 폴백한다.

## 기대 수익 모델

GGG는 카드별 드롭 확률을 공개하지 않는다. 게임 데이터(dat)에도 카드 단위 가중치는 없다.
대신 커뮤니티가 **스택된 덱을 대량으로 개봉해 실측한 가중치 표**를 쓴다. 스택된 덱은 전역 카드
가중치 표에서 무작위로 한 장을 뽑으므로, 개봉 분포가 곧 카드별 상대 드롭 가중치가 된다. 지도 선호도나
거래 유동성 편향이 원천적으로 끼어들지 않는다. 집계 표본은 스택된 덱 116만 개 개봉이고,
척도는 Rain of Chaos = 121,400 이다.

표본이 0인 카드는 관측 0회의 95% 상한(3/N)으로 가중치 상한을 구하고, 그 상한과 골드 수수료 회귀
추정치 중 작은 값을 쓴다. 표에 없는 신규 카드는 골드 회귀로 채운다(가중치 ∝ 골드^-2.35, R²=0.87).

일부 카드는 지역 몬스터가 아니라 **지도 보스에서만** 나온다(천벌, 아버지의 사랑, 기적 등).
드롭 경로가 달라 추정이 특히 불확실하므로 화면에 따로 표시하고, 직접 관측한 빈도가 있으면
실측 보정으로 고정할 수 있게 했다.

```
대상(m) = { 지도 m 전용 점술 카드 c : c의 드롭 레벨 ≤ 지도 m 지역 레벨 }

S_m = Σ 골드_c^(-γ)                 지도 m의 상대 카드 드롭량
E_m = Σ 골드_c^(-γ) × 시세_c         지도 m의 상대 기대 수익   ← 지도 간 순위 기준

A          = 지도당 카드 수 가정 ÷ 전체 지도 평균 S
1회당 수익  = A × E_m × (몬스터 밀도_m / 평균)
시간당 수익 = 1회당 수익 × 60 / (기준 시간 × 평균 클리어 / 클리어_m)
```

지도 전용 카드는 113개 지도 중 107개가 정확히 4장이라 개수 정규화 문제가 없다.
지역 제한 없이 아무 데서나 나오는 카드는 모든 지도에 똑같이 얹히는 값이라 비교에서 제외했다.

`A`의 근거가 되는 "지도 1회당 카드 드롭 수"는 공개 데이터가 없다. 따라서
**지도 간 순위와 배율은 유효하지만 카오스 절대값은 가정에 의존한다.**
지도 상세의 실측 보정에 "N회 돌려 k장"을 넣으면 이 값을 직접 맞출 수 있다.

24시간 거래량을 드롭률로 직접 쓰지 않는 이유는 유동성 편향이 크기 때문이다. 예를 들어
묘실 지도 전용 카드 거래량의 89.7%가 의사(The Doctor)인데, 나머지 카드가 0카오스라
아무도 거래하지 않아서 생기는 착시다. 거래량은 검증용 참고 지표로만 표시한다.

표기는 게임 한국어 클라이언트 용어를 따른다(점술 카드 · 지도 등급 · 지역 레벨 · 골드 ·
카오스 오브 · 신성한 오브). 다만 가격 단위 표기는 커뮤니티 통용 표현인 디바인/카오스를 쓴다. 지도·카드·보상 이름은 PoEDB 한국어판에서 공식 번역명을 수집한다.

## 개발

```bash
npm install
npm run data:build     # 패치 단위 구조 데이터 크롤 (영문/한국어, ~20초)
npm run data:prices    # 시세 스냅샷 갱신
npm run dev
```
