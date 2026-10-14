/**
 * Site credibility settings. Edit this one file to update what the page says about you.
 *
 * When you pass the FMVA, replace `credential: null` with:
 *   credential: {
 *     short: 'FMVA',
 *     long: 'Financial Modeling & Valuation Analyst (FMVA®)',
 *     issuer: 'Corporate Finance Institute',
 *     verifyUrl: 'https://...your CFI verification link...',
 *   },
 * Only add it once the credential is actually earned.
 */
export type Credential = { short: string; long: string; issuer: string; verifyUrl: string };

export const PROFILE: { name: string | null; credential: Credential | null; affiliation: string | null } = {
  name: null,
  credential: null,
  affiliation:
    "I also work with Smart Scale Management LLC, listing businesses for sale, so I see deals from the seller's side every day. To avoid conflicts, I don't provide buyer analysis on businesses my brokerage represents.",
};
