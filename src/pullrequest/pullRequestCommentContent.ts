import { CommitterMap } from '../interfaces'
import * as input from '../shared/getInputs'
import { getPrSignComment } from '../shared/pr-sign-comment'

interface ModeText {
  label: string          // 'CLA' | 'DCO'
  documentTitle: string  // 'Contributor License Agreement' | 'Developer Certificate of Origin'
  defaultSignPhrase: string
  botName: string        // 'CLA Assistant Lite bot' | 'DCO Assistant Lite bot'
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

export function commentContent(signed: boolean, committerMap: CommitterMap): string {
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
    const seem = committerMap.unknown.length > 1 ? 'seem' : 'seems'
    const names = committerMap.unknown.map(c => c.name).join(', ')
    text += `**${names}** ${seem} not to be a GitHub user.`
    text += ` You need a GitHub account to be able to sign the ${mode.label}. If you have already a GitHub account, please [add the email address used for this commit to your account](https://help.github.com/articles/why-are-my-commits-linked-to-the-wrong-user/#commits-are-not-linked-to-any-user).<br/>`
  }

  if (input.suggestRecheck()) {
    text += '<sub>You can retrigger this bot by commenting **recheck** in this Pull Request. </sub>'
  }

  text += botSignature(mode)
  return text
}

function botSignature(mode: ModeText): string {
  return `<sub>Posted by the **${mode.botName}**.</sub>`
}
