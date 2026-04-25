export function useValidationErrors(error: unknown): Record<string, string[]> | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number' &&
    'data' in error &&
    typeof (error as { data: unknown }).data === 'object' &&
    (error as { data: unknown }).data !== null &&
    (error as { status: number }).status === 422
  ) {
    return (error as { data: Record<string, string[]> }).data;
  }
  return null;
}
