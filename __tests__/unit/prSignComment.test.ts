import { resetEnv, setInput } from '../testHelpers/env'
import { getPrSignComment } from '../../src/shared/pr-sign-comment'

describe('getPrSignComment', () => {
  afterEach(resetEnv)

  it('falls back to the default phrase when no custom input is set', () => {
    expect(getPrSignComment()).toBe(
      'I have read the CLA Document and I hereby sign the CLA'
    )
  })

  it('returns the custom phrase when set', () => {
    setInput('custom-pr-sign-comment', 'I agree to the DCO')
    expect(getPrSignComment()).toBe('I agree to the DCO')
  })

  it('falls back when the custom phrase is empty', () => {
    setInput('custom-pr-sign-comment', '')
    expect(getPrSignComment()).toBe(
      'I have read the CLA Document and I hereby sign the CLA'
    )
  })
})
