/** 가격 단위 표기는 커뮤니티 통용 표현인 디바인/카오스를 쓴다 (아이템 이름은 신성한 오브/카오스 오브) */
export function chaos(value: number, divineChaos: number): string {
  if (!Number.isFinite(value)) return '-';
  if (divineChaos > 0 && value >= divineChaos * 0.9) {
    return `${round(value / divineChaos)} 디바인`;
  }
  return `${round(value)} 카오스`;
}

export function round(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

/** "1/37회" 처럼 드롭 빈도를 사람이 읽는 형태로 */
export function frequency(runsPerDrop: number): string {
  if (!Number.isFinite(runsPerDrop)) return '-';
  if (runsPerDrop < 1) return `${round(1 / runsPerDrop)}장/회`;
  return `1/${Math.round(runsPerDrop)}회`;
}

export function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  return `${Math.round(hour / 24)}일 전`;
}

/** 분 단위 시간을 사람이 읽는 형태로 (예: 3.2시간, 45분) */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return '-';
  if (minutes < 60) return `${Math.round(minutes)}분`;
  const hours = minutes / 60;
  return hours < 24 ? `${round(hours)}시간` : `${round(hours / 24)}일`;
}

/** 회수 판수 표기. 한 판이면 이미 본전이라 소수점을 보여줄 이유가 없다 */
export function paybackRuns(runs: number | null): string {
  if (runs === null || !Number.isFinite(runs)) return '-';
  if (runs < 1) return '1판 미만';
  return `${round(runs)}판`;
}
