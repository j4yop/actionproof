import canonicalize from "canonicalize";

export function stableStringify(value: unknown): string {
  const result = canonicalize(value);
  if (result === undefined) {
    throw new TypeError("Only JSON-compatible values can be canonicalized.");
  }
  return result;
}

export function valuesEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}
