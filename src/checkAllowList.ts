import { Committer } from './interfaces'

import * as input from './shared/getInputs'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isAllowListed(value: string): boolean {
  const allowListPatterns = input.getAllowListItem().split(',')
  return allowListPatterns.some(rawPattern => {
    const pattern = rawPattern.trim()
    if (pattern.includes('*')) {
      const regex = escapeRegExp(pattern).split('\\*').join('.*')
      return new RegExp(regex).test(value)
    }
    return pattern === value
  })
}

export function checkAllowList(committers: Committer[]): Committer[] {
  return committers.filter(
    committer =>
      committer &&
      !isAllowListed(committer.name) &&
      !(committer.email && isAllowListed(committer.email))
  )
}
