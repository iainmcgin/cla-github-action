import { resetEnv, setInput } from '../testHelpers/env'
import {
  getPrSignComment,
  DEFAULT_CLA_SIGN_PHRASE,
  DEFAULT_DCO_SIGN_PHRASE
} from '../../src/shared/pr-sign-comment'

describe('getPrSignComment', () => {
  afterEach(resetEnv)

  it('falls back to the CLA default phrase when no inputs are set', () => {
    expect(getPrSignComment()).toBe(DEFAULT_CLA_SIGN_PHRASE)
  })

  it('falls back to the DCO default phrase when use-dco-flag is true', () => {
    setInput('use-dco-flag', 'true')
    expect(getPrSignComment()).toBe(DEFAULT_DCO_SIGN_PHRASE)
  })

  it('returns the custom phrase when set', () => {
    setInput('custom-pr-sign-comment', 'I agree to the DCO')
    expect(getPrSignComment()).toBe('I agree to the DCO')
  })

  it('returns the custom phrase even when use-dco-flag is also set', () => {
    setInput('use-dco-flag', 'true')
    setInput('custom-pr-sign-comment', 'I agree to the DCO')
    expect(getPrSignComment()).toBe('I agree to the DCO')
  })

  it('falls back when the custom phrase is empty', () => {
    setInput('custom-pr-sign-comment', '')
    expect(getPrSignComment()).toBe(DEFAULT_CLA_SIGN_PHRASE)
  })
})
