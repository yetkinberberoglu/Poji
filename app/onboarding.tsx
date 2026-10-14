import { Redirect } from 'expo-router';

/**
 * The old provider form, retired.
 *
 * It was left in place while the new wizard proved itself, on the
 * reasoning that a fallback costs nothing. It cost something: people kept
 * landing here. A provider signing up on po-ji.com went through this
 * screen and reported the two things we had just fixed - four photographs
 * and no bank details - because this file had neither fix in it. Two
 * links in the provider profile pointed here as well.
 *
 * The file stays rather than being deleted so that an old bookmark, an
 * old link in an email, or a half-finished session still arrives
 * somewhere useful instead of at a blank page. Everything it used to do
 * now lives in provider-setup, which works out for itself which step the
 * person has reached.
 */
export default function OnboardingRetired() {
  return <Redirect href="/provider-setup" />;
}
