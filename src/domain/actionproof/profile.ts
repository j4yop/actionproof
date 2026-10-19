/**
 * The verifier profile.
 *
 * Shared by the HTTP route and the offline CLI so both compute the same
 * profile hash for the same verifier build. The profile states which verifier
 * version produced a verdict; it is not a signature over the evidence.
 */

export const VERIFIER_VERSION = "1.1.0";
export const PROFILE_ID = "actionproof-web-v1.1";

export const VERIFIER_PROFILE = {
  id: PROFILE_ID,
  verifierVersion: VERIFIER_VERSION,
} as const;
