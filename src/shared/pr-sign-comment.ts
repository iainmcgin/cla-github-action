import * as input from './getInputs'

export const DEFAULT_CLA_SIGN_PHRASE =
  'I have read the CLA Document and I hereby sign the CLA'
export const DEFAULT_DCO_SIGN_PHRASE =
  'I have read the DCO Document and I hereby sign the DCO'

/**
 * The phrase a contributor must post to sign. This is the single source of
 * truth for both the text the bot tells contributors to paste and the text
 * the matcher accepts, so the two cannot drift.
 */
export function getPrSignComment(): string {
  const custom = input.getCustomPrSignComment()
  if (custom !== '') {
    return custom
  }
  return input.getUseDcoFlag()
    ? DEFAULT_DCO_SIGN_PHRASE
    : DEFAULT_CLA_SIGN_PHRASE
}
