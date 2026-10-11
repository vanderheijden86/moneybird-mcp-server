const TRUE_VALUES = ['true', '1', 'yes', 'on'];
const FALSE_VALUES = ['false', '0', 'no', 'off', ''];

// A typo such as MONEYBIRD_READ_ONLY=ture must not silently allow writes, so an
// unrecognised value is an error rather than a default.
export function parseReadOnly(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  if (TRUE_VALUES.includes(normalized)) return true;
  if (FALSE_VALUES.includes(normalized)) return false;
  throw new Error(
    `Invalid MONEYBIRD_READ_ONLY value "${value}". Use one of: ${TRUE_VALUES.join(', ')} (read-only) or ${FALSE_VALUES.filter(Boolean).join(', ')} (read-write).`
  );
}
