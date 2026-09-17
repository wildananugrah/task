// Comments and chat messages carry three kinds of token: "@Name" mentions,
// "/TSK-104" task references, and links. All three are split out here so the
// renderer can style them, make task references jump, and make links clickable.

// Ordered: the link alternative is first so that a URL is never chopped up by
// the task-reference pattern (https://ABC-123 would otherwise match both).
const TOKEN = /(https?:\/\/[^\s<>"]+|@[A-Za-z]+|\/[A-Z]{3}-\d+)/

// Sentence punctuation that is almost never part of a link.
const ALWAYS_TRAILING = '.,;:!?\'">'

const CLOSERS = { ')': '(', ']': '[', '}': '{' }

/**
 * Splits a matched URL into the link and the punctuation that followed it.
 *
 * A closing bracket is only punctuation when the link did not open it, and that
 * has to be counted one bracket at a time: in "(https://../Foo_(bar))" the
 * final ")" closes the sentence and the one before it belongs to the URL.
 */
function splitTrailing(raw) {
  let url = raw
  let cut = ''

  while (url) {
    const last = url[url.length - 1]

    if (ALWAYS_TRAILING.includes(last)) {
      cut = last + cut
      url = url.slice(0, -1)
      continue
    }

    const opener = CLOSERS[last]
    if (opener) {
      const opens = url.split(opener).length - 1
      const closes = url.split(last).length - 1
      if (closes > opens) {
        cut = last + cut
        url = url.slice(0, -1)
        continue
      }
    }
    break
  }

  return [url, cut]
}

/** Only these ever become an href. Nothing else reaches the DOM as a link. */
const SAFE_PROTOCOLS = new Set(['http:', 'https:'])

export function safeUrl(value) {
  try {
    const url = new URL(value)
    return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export function parseRichText(text) {
  const parts = []

  for (const [index, value] of String(text || '')
    .split(TOKEN)
    .filter(Boolean)
    .entries()) {
    const key = `${index}-${value}`

    if (/^https?:\/\//.test(value)) {
      const [link, cut] = splitTrailing(value)

      parts.push({ key, value: link, url: safeUrl(link), isMention: false, taskRef: null })
      if (cut) parts.push({ key: `${key}-tail`, value: cut, isMention: false, taskRef: null })
      continue
    }

    parts.push({
      key,
      value,
      isMention: value[0] === '@',
      taskRef: value[0] === '/' ? value.slice(1) : null,
    })
  }

  return parts
}

/**
 * The trailing "@wel" / "/TSK-1" the caret is sitting on, if any.
 *
 * Both markers must start a word. Without that, typing an email address popped
 * the mention menu at the "@", and every "https://" popped the task menu at the
 * second slash — autocomplete appearing in the middle of a URL.
 */
export function trailingToken(value) {
  const match = /(?:^|\s)([@/])([A-Za-z0-9-]*)$/.exec(value)
  if (!match) return null
  return { type: match[1], query: match[2].toLowerCase(), token: `${match[1]}${match[2]}` }
}

export function replaceTrailingToken(value, token, insert) {
  return `${value.slice(0, value.length - token.length)}${insert} `
}
