// 에이전트 게임란 공용 인코더 — ASCII 문자열을 8비트 이진수(바이트당 공백 구분)로.
// 입력은 ASCII 한정 (한글 등 멀티바이트는 8비트를 넘어 깨진다).
export function toBinary(text: string): string {
  return [...text].map((ch) => ch.codePointAt(0)!.toString(2).padStart(8, '0')).join(' ');
}
