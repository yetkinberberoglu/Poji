import { Redirect } from 'expo-router';

/**
 * The old first half of becoming a provider, retired.
 *
 * join asked for the account and onboarding asked for everything else,
 * and the split is what let somebody finish one and be sent back to the
 * start of the other. provider-setup is both, in one pass, resuming
 * wherever the person left off.
 *
 * Kept as a redirect rather than deleted: old links should land on the
 * new form, not on nothing.
 */
export default function JoinRetired() {
  return <Redirect href="/provider-setup" />;
}
