/** CLI argument helpers (TD-007), kept free of side effects so they can be unit-tested. */

/** A flag's value must be present and not another flag. Reports and exits otherwise. */
export function flagValue(
  flag: string,
  value: string | undefined,
  fail: (message: string) => never = message => {
    console.error(message);
    process.exit(1);
  }
): string {
  if (!value || value.startsWith('--')) return fail(`${flag} requires a value`);
  return value;
}

/** Describe a config load failure without echoing JSON.parse text, which can quote key material. */
export function describeConfigError(error: unknown): string {
  if (error instanceof SyntaxError) {
    const msg = error.message;
    const where =
      /line (\d+) column (\d+)/.exec(msg)?.[0] ??
      /position (\d+)/.exec(msg)?.[0] ??
      'unknown position';
    return `invalid JSON (SyntaxError at ${where})`;
  }
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return `${(error as Error | undefined)?.name ?? 'Error'}${code ? ` ${code}` : ''}`;
}
