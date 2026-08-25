/** 공식 한국어 표기를 우선 쓰고, 없으면 영문 원문으로 대체한다 */
export function ko(korean: string | null | undefined, english: string): string {
  return korean && korean.trim() ? korean : english;
}

/** 지도명 뒤의 " 지도" / " Map" 을 떼어 표에서 짧게 보여준다 */
export function shortMapName(korean: string | null | undefined, english: string): string {
  return ko(korean, english).replace(/\s*지도$/, '').replace(/\s+Map$/, '');
}

/** PoEDB 한국어 문서 주소. 슬러그가 없으면 링크를 걸지 않는다 */
export function poedbUrl(slug: string | null | undefined): string | null {
  return slug ? `https://poedb.tw/kr/${slug}` : null;
}
