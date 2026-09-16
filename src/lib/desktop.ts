import { isTauri } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

export type OpenedTextDocument = {
  content: string
  name: string
}

const documentFilters = [
  { name: 'JSON / XML / Text', extensions: ['json', 'xml', 'txt'] },
  { name: 'All files', extensions: ['*'] },
]

export function isDesktopApp(): boolean {
  return isTauri()
}

export async function openTextDocument(): Promise<OpenedTextDocument | null> {
  const selected = await open({
    title: '打开文档',
    multiple: false,
    directory: false,
    filters: documentFilters,
  })
  if (typeof selected !== 'string') return null

  const content = await readTextFile(selected)
  return {
    content,
    name: selected.split(/[\\/]/).pop() || 'document.txt',
  }
}

export async function saveTextDocument(content: string, extension: 'json' | 'xml'): Promise<boolean> {
  const selected = await save({
    title: '导出文档',
    defaultPath: `document.${extension}`,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  })
  if (!selected) return false

  await writeTextFile(selected, content)
  return true
}
