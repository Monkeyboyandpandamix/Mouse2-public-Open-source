/** Log fetch/API errors for diagnostics. Use in .catch(logWarn("Context")) instead of .catch(() => {}). */
export function logWarn(label: string) {
  return (err: unknown) => {
    console.warn(`[${label}]`, err);
  };
}
