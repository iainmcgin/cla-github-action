import { Committer, CommitterMap } from '../interfaces'
import * as input from '../shared/getInputs'
import { getPrSignComment } from '../shared/pr-sign-comment'

interface ModeText {
  label: string // 'CLA' | 'DCO'
  documentTitle: string // 'Contributor License Agreement' | 'Developer Certificate of Origin'
  defaultSignPhrase: string
  botName: string // 'CLA Assistant Lite bot' | 'DCO Assistant Lite bot'
}

const CLA: ModeText = {
  label: 'CLA',
  documentTitle: 'Contributor License Agreement',
  defaultSignPhrase: 'I have read the CLA Document and I hereby sign the CLA',
  botName: 'CLA Assistant Lite bot'
}
const DCO: ModeText = {
  label: 'DCO',
  documentTitle: 'Developer Certificate of Origin',
  defaultSignPhrase: 'I have read the DCO Document and I hereby sign the DCO',
  botName: 'DCO Assistant Lite bot'
}

export function commentContent(
  signed: boolean,
  committerMap: CommitterMap
): string {
  const mode = input.getUseDcoFlag() ? DCO : CLA
  return signed ? renderAllSigned(mode) : renderPending(mode, committerMap)
}

function renderAllSigned(mode: ModeText): string {
  const allSignedLine =
    input.getCustomAllSignedPrComment() ||
    `All contributors have signed the ${mode.label}  ✍️ ✅`
  return `${allSignedLine}<br/>${botSignature(mode)}`
}

function renderPending(mode: ModeText, committerMap: CommitterMap): string {
  const committersCount =
    committerMap.signed.length + committerMap.notSigned.length || 1
  const you = committersCount > 1 ? 'you all' : 'you'

  const introTemplate =
    input.getCustomNotSignedPrComment() ||
    `<br/>Thank you for your submission, we really appreciate it. Like many open-source projects, we ask that $you sign our [${mode.documentTitle}](${input.getPathToDocument()}) before we can accept your contribution. You can sign the ${mode.label} by just posting a Pull Request Comment same as the below format.<br/>`
  const intro = introTemplate.replace('$you', you)

  const signPhrase =
    mode === CLA
      ? getPrSignComment()
      : input.getCustomPrSignComment() || DCO.defaultSignPhrase

  let text = `${intro}
   - - -
   ${signPhrase}
   - - -
   `

  if (committersCount > 1) {
    text += `**${committerMap.signed.length}** out of **${committerMap.signed.length + committerMap.notSigned.length}** committers have signed the ${mode.label}.`
    for (const s of committerMap.signed) {
      text += `<br/>:white_check_mark: [${s.name}](https://github.com/${s.name})`
    }
    for (const u of committerMap.notSigned) {
      text += `<br/>:x: @${u.name}`
    }
    text += '<br/>'
  }

  if (committerMap.unknown.length > 0) {
    text += renderUnlinkedCommitBlock(mode, committerMap.unknown)
  }

  if (input.suggestRecheck()) {
    text +=
      '<sub>You can retrigger this bot by commenting **recheck** in this Pull Request. </sub>'
  }

  text += botSignature(mode)
  return text
}

function botSignature(mode: ModeText): string {
  return `<sub>Posted by the **${mode.botName}**.</sub>`
}

/**
 * Renders the "commit author email isn't linked to a GitHub account" block.
 * Shown both inline (when mixed with signed/unsigned committers) and as the
 * sole body (when every committer is unlinked — in which case this is the
 * only actionable thing in the comment).
 */
function renderUnlinkedCommitBlock(
  mode: ModeText,
  unlinked: Committer[]
): string {
  const plural = unlinked.length > 1
  const verb = plural ? 'were' : 'was'
  const commits = plural ? 'commits' : 'commit'

  // Render each unlinked identity as "name <email>" when we have an email to
  // show, otherwise just the name. Wrap email in backticks so Markdown does
  // not interpret it as a mailto: auto-link.
  const identityLines = unlinked
    .map(c => {
      const display =
        c.email && c.email !== c.name ? `${c.name} \`<${c.email}>\`` : c.name
      return `- ${display}`
    })
    .join('\n')

  return `

> [!WARNING]
> ${unlinked.length} ${commits} in this PR ${verb} authored by an email address that is not linked to any GitHub user, so we cannot tell whether the author has signed the ${mode.label}.
>
> Unlinked author${plural ? 's' : ''}:
>
> ${identityLines.replace(/\n/g, '\n> ')}
>
> **To unblock this PR, do one of the following:**
>
> 1. **Link the email to your GitHub account** (recommended). Add each address above at [github.com/settings/emails](https://github.com/settings/emails), then push another commit (or comment \`recheck\`) so this check re-runs. See [why commits are not linked to a user](https://docs.github.com/en/pull-requests/committing-changes-to-your-project/troubleshooting-commits/why-are-my-commits-linked-to-the-wrong-user#commits-are-not-linked-to-any-user) for details.
>
> 2. **Rewrite the commits** to use an email that is already linked to your GitHub account:
>
>    \`\`\`bash
>    # Set the correct email locally (one-off, for this repo):
>    git config user.email you@example.com
>    # Rewrite every commit on this branch with the corrected identity:
>    git rebase -i --root --exec 'git commit --amend --reset-author --no-edit'
>    git push --force-with-lease
>    \`\`\`
>
>    After the push, comment \`recheck\` on this PR (or just re-push) to re-run the check.
<br/>`
}
