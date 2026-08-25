/** 카오스 값을 상황에 맞게 카오스/디바인으로 표기 */
export function chaos(value: number, divineChaos: number): string {
  if (!Number.isFinite(value)) return '-';
  if (divineChaos > 0 && value >= divineChaos * 0.9) {
    return `${round(value / divineChaos)} div`;
  }
  return `${round(value)} c`;
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

/** "1/37회" 처럼 드랍 빈도를 사람이 읽는 형태로 */
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
