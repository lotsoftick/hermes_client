interface NodeExecError {
  stderr?: Buffer | string;
  stdout?: Buffer | string;
  message?: string;
}

export function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const e = err as NodeExecError;
    const out = e.stderr?.toString() || e.stdout?.toString() || e.message;
    if (out) return out;
  }
  return String(err);
}

export function execErrText(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as NodeExecError;
    return e.stderr?.toString() || e.stdout?.toString() || e.message || String(err);
  }
  return errMsg(err);
}
