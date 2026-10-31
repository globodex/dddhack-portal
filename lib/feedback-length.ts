/** Fixed posting minimum; no policy/database setting controls this validation. */
export const feedbackMinimum = 30;
export const feedbackLength = (value: string) => Array.from(value.trim()).length;
export function feedbackLengthValid(value: string, maximum: number) {
  return feedbackLength(value) >= feedbackMinimum && value.trim().length <= maximum;
}
