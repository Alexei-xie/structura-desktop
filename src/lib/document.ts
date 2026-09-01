export type Format = 'json' | 'xml'

export type TreeNode = {
  id: string
  label: string
  path: string
  type: string
  value?: string
  copyValue?: string
  children?: TreeNode[]
}

export type ParseResult = {
  ok: boolean
  format: Format
  value?: unknown
  error?: string
  line?: number
  column?: number
}

export const jsonSample = `{
  "project": "Structura",
  "ready": true,
  "formats": ["JSON", "XML"],
  "meta": {
    "version": 1,
    "private": true
  }
}`

export const xmlSample = `<?xml version="1.0" encoding="UTF-8"?>
<project name="Structura">
  <ready>true</ready>
  <formats>
    <format>JSON</format>
    <format>XML</format>
  </formats>
  <meta version="1" private="true" />
</project>`

export function detectFormat(text: string): Format {
  return text.trimStart().startsWith('<') ? 'xml' : 'json'
}

function jsonErrorPosition(text: string, message: string) {
  const match = message.match(/position\s+(\d+)/i)
  if (!match) return {}
  const position = Number(match[1])
  const before = text.slice(0, position)
  const lines = before.split('\n')
  return { line: lines.length, column: lines[lines.length - 1].length + 1 }
}

export function parseDocument(text: string, forcedFormat?: Format): ParseResult {
  const format = forcedFormat ?? detectFormat(text)
  if (!text.trim()) return { ok: false, format, error: '请输入 JSON 或 XML 内容' }

  if (format === 'json') {
    try {
      return { ok: true, format, value: JSON.parse(text) }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'JSON 解析失败'
      return { ok: false, format, error: message, ...jsonErrorPosition(text, message) }
    }
  }

  const document = new DOMParser().parseFromString(text, 'application/xml')
  const parserError = document.querySelector('parsererror')
  if (parserError) {
    const message = parserError.textContent?.replace(/\s+/g, ' ').trim() || 'XML 解析失败'
    const lineMatch = message.match(/line\s+(\d+)/i)
    const columnMatch = message.match(/column\s+(\d+)/i)
    return {
      ok: false,
      format,
      error: message,
      line: lineMatch ? Number(lineMatch[1]) : undefined,
      column: columnMatch ? Number(columnMatch[1]) : undefined,
    }
  }
  return { ok: true, format, value: document }
}

export function formatDocument(text: string, format: Format, compact = false): string {
  const parsed = parseDocument(text, format)
  if (!parsed.ok) throw new Error(parsed.error)
  if (format === 'json') return JSON.stringify(parsed.value, null, compact ? 0 : 2)
  const body = serializeXml(parsed.value as XMLDocument, compact)
  const declaration = text.match(/^\s*(<\?xml\s+[^?]*\?>)/i)?.[1]
  return declaration ? `${declaration}${compact ? '' : '\n'}${body}` : body
}

export function unescapeText(text: string): string {
  if (!text.trim()) throw new Error('请输入需要去转义的内容')

  try {
    const parsed = JSON.parse(text)
    if (typeof parsed === 'string') return parsed
    throw new Error('当前内容已经是有效 JSON，无需去转义')
  } catch (error) {
    if (error instanceof Error && error.message === '当前内容已经是有效 JSON，无需去转义') throw error
  }

  const backslashDecoded = text.replace(
    /\\(?:u[\da-fA-F]{4}|x[\da-fA-F]{2}|["'\\/bfnrt])/g,
    (sequence) => {
      if (sequence[1] === 'u') return String.fromCharCode(Number.parseInt(sequence.slice(2), 16))
      if (sequence[1] === 'x') return String.fromCharCode(Number.parseInt(sequence.slice(2), 16))
      const escapes: Record<string, string> = {
        '"': '"', "'": "'", '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t',
      }
      return escapes[sequence[1]] ?? sequence
    },
  )
  const entityDecoded = backslashDecoded.replace(
    /&(lt|gt|amp|quot|apos|#\d+|#x[\da-fA-F]+);/g,
    (entity, name: string) => {
      const named: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }
      if (name.startsWith('#x')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16))
      if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10))
      return named[name] ?? entity
    },
  )

  if (entityDecoded === text) throw new Error('未检测到可去除的转义字符')
  return entityDecoded
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function serializeXml(document: XMLDocument, compact: boolean): string {
  const render = (node: Node, depth: number): string => {
    if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
      const pi = node as ProcessingInstruction
      return `<?${pi.target}${pi.data ? ` ${pi.data}` : ''}?>`
    }
    if (node.nodeType === Node.COMMENT_NODE) return `<!--${node.nodeValue ?? ''}-->`
    if (node.nodeType === Node.CDATA_SECTION_NODE) return `<![CDATA[${node.nodeValue ?? ''}]]>`
    if (node.nodeType === Node.TEXT_NODE) return escapeXml(node.nodeValue ?? '')
    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const element = node as Element
    const attributes = [...element.attributes]
      .map((attribute) => ` ${attribute.name}="${escapeXml(attribute.value)}"`)
      .join('')
    const children = [...element.childNodes].filter(
      (child) => child.nodeType !== Node.TEXT_NODE || Boolean(child.nodeValue?.trim()),
    )
    if (!children.length) return `<${element.tagName}${attributes} />`

    const onlyText = children.every(
      (child) => child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE,
    )
    if (compact || onlyText) {
      return `<${element.tagName}${attributes}>${children.map((child) => render(child, depth + 1)).join('')}</${element.tagName}>`
    }
    const indent = '  '.repeat(depth)
    const inner = children.map((child) => `${'  '.repeat(depth + 1)}${render(child, depth + 1)}`).join('\n')
    return `<${element.tagName}${attributes}>\n${inner}\n${indent}</${element.tagName}>`
  }

  const nodes = [...document.childNodes].filter(
    (node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.nodeValue?.trim()),
  )
  return nodes.map((node) => render(node, 0)).join(compact ? '' : '\n')
}

function jsonTree(value: unknown, label: string, path: string): TreeNode {
  const id = `${path}:${label}`
  if (Array.isArray(value)) {
    return {
      id,
      label,
      path,
      type: `array · ${value.length}`,
      children: value.map((item, index) => jsonTree(item, String(index), `${path}[${index}]`)),
    }
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return {
      id,
      label,
      path,
      type: `object · ${entries.length}`,
      children: entries.map(([key, item]) =>
        jsonTree(item, key, /^[$A-Z_][0-9A-Z_$]*$/i.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`),
      ),
    }
  }
  return {
    id,
    label,
    path,
    type: value === null ? 'null' : typeof value,
    value: JSON.stringify(value),
    copyValue: typeof value === 'string' ? value : JSON.stringify(value),
  }
}

function xmlTree(element: Element, path: string): TreeNode {
  const siblings = element.parentElement
    ? [...element.parentElement.children].filter((child) => child.tagName === element.tagName)
    : [element]
  const index = siblings.indexOf(element) + 1
  const ownPath = `${path}/${element.tagName}${siblings.length > 1 ? `[${index}]` : ''}`
  const attributes: TreeNode[] = [...element.attributes].map((attribute) => ({
    id: `${ownPath}/@${attribute.name}`,
    label: `@${attribute.name}`,
    path: `${ownPath}/@${attribute.name}`,
    type: 'attribute',
    value: attribute.value,
    copyValue: attribute.value,
  }))
  const elements = [...element.children].map((child) => xmlTree(child, ownPath))
  const text = [...element.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.nodeValue?.trim())
    .filter(Boolean)
    .join(' ')
  const textNode: TreeNode[] = text
    ? [{ id: `${ownPath}/text()`, label: '#text', path: `${ownPath}/text()`, type: 'text', value: text, copyValue: text }]
    : []
  return {
    id: ownPath,
    label: element.tagName,
    path: ownPath,
    type: `element · ${attributes.length + elements.length + textNode.length}`,
    children: [...attributes, ...textNode, ...elements],
  }
}

export function toTree(parsed: ParseResult): TreeNode | undefined {
  if (!parsed.ok) return undefined
  if (parsed.format === 'json') return jsonTree(parsed.value, 'root', '$')
  const document = parsed.value as XMLDocument
  return xmlTree(document.documentElement, '')
}

function valueToXml(value: unknown, name: string, depth = 0): string {
  const indent = '  '.repeat(depth)
  if (Array.isArray(value)) {
    return value.map((item) => valueToXml(item, name, depth)).join('\n')
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const attributes = Object.entries(record)
      .filter(([key]) => key.startsWith('@'))
      .map(([key, item]) => ` ${key.slice(1)}="${escapeXml(String(item))}"`)
      .join('')
    const text = record['#text']
    const children = Object.entries(record).filter(([key]) => !key.startsWith('@') && key !== '#text')
    if (!children.length && text === undefined) return `${indent}<${name}${attributes} />`
    if (!children.length) return `${indent}<${name}${attributes}>${escapeXml(String(text))}</${name}>`
    const body = children.map(([key, item]) => valueToXml(item, key, depth + 1)).join('\n')
    return `${indent}<${name}${attributes}>\n${body}\n${indent}</${name}>`
  }
  return `${indent}<${name}>${escapeXml(value === null ? '' : String(value))}</${name}>`
}

function xmlElementToJson(element: Element): unknown {
  const result: Record<string, unknown> = {}
  for (const attribute of [...element.attributes]) result[`@${attribute.name}`] = attribute.value
  const text = [...element.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE)
    .map((node) => node.nodeValue?.trim())
    .filter(Boolean)
    .join(' ')
  if (!element.children.length) {
    if (!Object.keys(result).length) return text
    if (text) result['#text'] = text
    return result
  }
  for (const child of [...element.children]) {
    const value = xmlElementToJson(child)
    const existing = result[child.tagName]
    if (existing === undefined) result[child.tagName] = value
    else if (Array.isArray(existing)) existing.push(value)
    else result[child.tagName] = [existing, value]
  }
  if (text) result['#text'] = text
  return result
}

export function convertDocument(text: string, format: Format): { text: string; format: Format } {
  const parsed = parseDocument(text, format)
  if (!parsed.ok) throw new Error(parsed.error)
  if (format === 'json') {
    const value = parsed.value as unknown
    const root: [string, unknown] = Array.isArray(value)
      ? ['root', { item: value }]
      : value !== null && typeof value === 'object' && Object.keys(value).length === 1
        ? Object.entries(value as Record<string, unknown>)[0]
        : ['root', value]
    return { format: 'xml', text: `<?xml version="1.0" encoding="UTF-8"?>\n${valueToXml(root[1], root[0])}` }
  }
  const document = parsed.value as XMLDocument
  return {
    format: 'json',
    text: JSON.stringify({ [document.documentElement.tagName]: xmlElementToJson(document.documentElement) }, null, 2),
  }
}

export type DiffLine = { kind: 'same' | 'add' | 'remove'; text: string; left?: number; right?: number }

type SourceSpan = {
  path: string
  start: number
  end: number
  children: SourceSpan[]
}

function findDeepestSpan(node: SourceSpan, offset: number): SourceSpan | undefined {
  if (offset < node.start || offset > node.end) return undefined
  for (const child of node.children) {
    const match = findDeepestSpan(child, offset)
    if (match) return match
  }
  return node
}

function jsonPathAtOffset(text: string, offset: number): string {
  let cursor = 0
  const skipWhitespace = () => {
    while (/\s/.test(text[cursor] ?? '')) cursor += 1
  }
  const readString = () => {
    const start = cursor
    cursor += 1
    let escaped = false
    while (cursor < text.length) {
      const character = text[cursor]
      cursor += 1
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') break
    }
    const raw = text.slice(start, cursor)
    try { return { value: JSON.parse(raw) as string, start } }
    catch { return { value: raw.slice(1, -1), start } }
  }
  const parseValue = (path: string, sourceStart?: number): SourceSpan => {
    skipWhitespace()
    const valueStart = sourceStart ?? cursor
    const character = text[cursor]
    if (character === '{') {
      cursor += 1
      const children: SourceSpan[] = []
      skipWhitespace()
      while (cursor < text.length && text[cursor] !== '}') {
        if (text[cursor] !== '"') break
        const key = readString()
        skipWhitespace()
        if (text[cursor] === ':') cursor += 1
        const childPath = /^[$A-Z_][0-9A-Z_$]*$/i.test(key.value)
          ? `${path}.${key.value}`
          : `${path}[${JSON.stringify(key.value)}]`
        children.push(parseValue(childPath, key.start))
        skipWhitespace()
        if (text[cursor] === ',') { cursor += 1; skipWhitespace() }
        else break
      }
      if (text[cursor] === '}') cursor += 1
      return { path, start: valueStart, end: cursor, children }
    }
    if (character === '[') {
      cursor += 1
      const children: SourceSpan[] = []
      let index = 0
      skipWhitespace()
      while (cursor < text.length && text[cursor] !== ']') {
        children.push(parseValue(`${path}[${index}]`))
        index += 1
        skipWhitespace()
        if (text[cursor] === ',') { cursor += 1; skipWhitespace() }
        else break
      }
      if (text[cursor] === ']') cursor += 1
      return { path, start: valueStart, end: cursor, children }
    }
    if (character === '"') readString()
    else while (cursor < text.length && !/[\s,}\]]/.test(text[cursor])) cursor += 1
    return { path, start: valueStart, end: cursor, children: [] }
  }

  try {
    const root = parseValue('$')
    return findDeepestSpan(root, Math.min(offset, text.length))?.path ?? '$'
  } catch {
    return '$'
  }
}

type XmlSpan = SourceSpan & { name: string }

function xmlPathAtOffset(text: string, offset: number): string {
  const root: XmlSpan = { name: '', path: '', start: 0, end: text.length, children: [] }
  const stack: XmlSpan[] = [root]
  const tagPattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?\s*([\w:.-]+)(?:\s[^<>]*?)?\/?>/g
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(text))) {
    const token = match[0]
    if (token.startsWith('<?') || token.startsWith('<!--') || token.startsWith('<![CDATA')) continue
    const name = match[1]
    if (token.startsWith('</')) {
      const node = stack.pop()
      if (node && node !== root) node.end = tagPattern.lastIndex
      continue
    }
    const parent = stack[stack.length - 1]
    const node: XmlSpan = { name, path: '', start: match.index, end: tagPattern.lastIndex, children: [] }
    parent.children.push(node)
    if (!token.endsWith('/>')) stack.push(node)
  }
  while (stack.length > 1) {
    const node = stack.pop()!
    node.end = text.length
  }
  const assignPaths = (parent: XmlSpan, parentPath: string) => {
    const totals = new Map<string, number>()
    for (const child of parent.children as XmlSpan[]) totals.set(child.name, (totals.get(child.name) ?? 0) + 1)
    const seen = new Map<string, number>()
    for (const child of parent.children as XmlSpan[]) {
      const index = (seen.get(child.name) ?? 0) + 1
      seen.set(child.name, index)
      child.path = `${parentPath}/${child.name}${(totals.get(child.name) ?? 0) > 1 ? `[${index}]` : ''}`
      assignPaths(child, child.path)
    }
  }
  assignPaths(root, '')
  for (const child of root.children) {
    const matchNode = findDeepestSpan(child, Math.min(offset, text.length))
    if (matchNode) return matchNode.path
  }
  return root.children[0]?.path ?? '/'
}

export function pathAtOffset(text: string, format: Format, offset: number): string {
  return format === 'json' ? jsonPathAtOffset(text, offset) : xmlPathAtOffset(text, offset)
}

export function lineDiff(leftText: string, rightText: string): DiffLine[] {
  const left = leftText.split('\n').slice(0, 500)
  const right = rightText.split('\n').slice(0, 500)
  const rows = left.length + 1
  const columns = right.length + 1
  const matrix = Array.from({ length: rows }, () => new Uint16Array(columns))
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      matrix[i][j] = left[i] === right[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1])
    }
  }
  const result: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      result.push({ kind: 'same', text: left[i], left: i + 1, right: j + 1 })
      i += 1
      j += 1
    } else if (matrix[i + 1][j] >= matrix[i][j + 1]) {
      result.push({ kind: 'remove', text: left[i], left: i + 1 })
      i += 1
    } else {
      result.push({ kind: 'add', text: right[j], right: j + 1 })
      j += 1
    }
  }
  while (i < left.length) result.push({ kind: 'remove', text: left[i], left: ++i })
  while (j < right.length) result.push({ kind: 'add', text: right[j], right: ++j })
  return result
}
