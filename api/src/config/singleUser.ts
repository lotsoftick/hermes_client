const RAW = String(process.env.HERMES_SINGLE_USER_MODE || '').toLowerCase();

export function isSingleUserMode(): boolean {
  if (['0', 'false', 'no', 'off'].includes(RAW)) return false;
  if (['1', 'true', 'yes', 'on'].includes(RAW)) return true;
  return process.env.NODE_ENV === 'production';
}
