// Comments and chat messages carry two kinds of token: "@Name" mentions and
// "/TSK-104" task references. Both are split out here so the renderer can style
// them and make task references clickable.

const TOKEN = /(@[A-Za-z]+|\/[A-Z]{3}-\d+)/

export function parseRichText(text) {
  return String(text || '')
    .split(TOKEN)
    .filter(Boolean)
    .map((value, index) => ({
      key: `${index}-${value}`,
      value,
      isMention: value[0] === '@',
      taskId: value[0] === '/' ? value.slice(1) : null,
    }))
}

/** The trailing "@wel" / "/TSK-1" the caret is sitting on, if any. */
export function trailingToken(value) {
  const match = /([@/])([A-Za-z0-9-]*)$/.exec(value)
  if (!match) return null
  return { type: match[1], query: match[2].toLowerCase(), token: match[0] }
}

export function replaceTrailingToken(value, token, insert) {
  return `${value.slice(0, value.length - token.length)}${insert} `
}

export function emailsFrom(value) {
  return String(value || '')
    .split(/[,\s]+/)
    .filter((entry) => entry.indexOf('@') > 0)
}

export function nameFromEmail(email) {
  const local = email.split('@')[0].replace(/[^A-Za-z]/g, ' ').trim()
  return local ? local[0].toUpperCase() + local.slice(1) : email
}

export function initialsFrom(name) {
  const words = name.trim().split(/\s+/)
  if (!words[0]) return '??'
  const second = words[1] ? words[1][0] : words[0][1] || words[0][0]
  return (words[0][0] + second).toUpperCase()
}

export function extensionOf(fileName) {
  return (fileName.split('.').pop() || 'file').slice(0, 4).toUpperCase()
}
