import Editor, { DiffEditor, loader, type DiffOnMount, type OnMount } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  convertDocument,
  detectFormat,
  formatDocument,
  jsonSample,
  pathAtOffset,
  parseDocument,
  toTree,
  unescapeText,
  type Format,
  type TreeNode,
} from './lib/document'

loader.config({ monaco })

type View = 'tree' | 'source' | 'diff' | 'history'
type HistoryEntry = { id: number; format: Format; text: string; label: string }

const HISTORY_KEY = 'structura.history.v1'

function Icon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    format: '⌘', compact: '↔', unescape: '↳', validate: '✓', convert: '⇄', upload: '↑', download: '↓',
    copy: '⧉', clear: '×', theme: '◐', tree: '⌘', code: '</>', diff: '±', history: '◴',
  }
  return <span className="icon">{icons[name] ?? '·'}</span>
}

function TreeRow({ node, depth = 0, selected, onSelect, onCopy }: {
  node: TreeNode
  depth?: number
  selected: string
  onSelect: (node: TreeNode) => void
  onCopy: (value: string, kind: '属性' | '值') => void
}) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = Boolean(node.children?.length)
  useEffect(() => {
    if (hasChildren && selected.startsWith(node.path) && selected !== node.path) setOpen(true)
  }, [hasChildren, node.path, selected])
  const copyUnlessSelecting = (
    event: React.MouseEvent<HTMLElement>,
    value: string,
    kind: '属性' | '值',
  ) => {
    event.stopPropagation()
    const selection = window.getSelection()
    const selectedText = selection?.toString() ?? ''
    if (selectedText && selection?.anchorNode && event.currentTarget.contains(selection.anchorNode)) return
    onCopy(value, kind)
  }
  return (
    <div>
      <div
        className={`tree-row ${selected === node.path ? 'selected' : ''}`}
        data-tree-path={node.path}
        style={{ paddingLeft: `${12 + depth * 18}px` }}
        onClick={() => { onSelect(node); if (hasChildren) setOpen((value) => !value) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect(node)
            if (hasChildren) setOpen((value) => !value)
          }
        }}
        role="button"
        tabIndex={0}
        title={node.path}
      >
        <span className={`chevron ${open ? 'open' : ''}`}>{hasChildren ? '›' : '·'}</span>
        <span
          className="node-label"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => copyUnlessSelecting(event, node.label, '属性')}
          onKeyDown={(event) => { if (event.key === 'Enter') onCopy(node.label, '属性') }}
          role="button"
          tabIndex={0}
          title={`单击复制属性；拖拽可选择部分字符：${node.label}`}
        >{node.label}</span>
        <span className={`node-type ${node.type.split(' ')[0]}`}>{node.type}</span>
        {node.value !== undefined && (
          <span
            className="node-value"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => copyUnlessSelecting(event, node.copyValue ?? node.value ?? '', '值')}
            onKeyDown={(event) => { if (event.key === 'Enter') onCopy(node.copyValue ?? node.value ?? '', '值') }}
            role="button"
            tabIndex={0}
            title="单击复制原始值；拖拽可选择部分字符"
          >{node.value}</span>
        )}
      </div>
      {open && node.children?.map((child) => (
        <TreeRow key={child.id} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} onCopy={onCopy} />
      ))}
    </div>
  )
}

function App() {
  const [text, setText] = useState(jsonSample)
  const [compareText, setCompareText] = useState('')
  const [format, setFormat] = useState<Format>('json')
  const [autoDetect, setAutoDetect] = useState(true)
  const [view, setView] = useState<View>('tree')
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const [sideBySide, setSideBySide] = useState(true)
  const [normalizeDiff, setNormalizeDiff] = useState(false)
  const [diffStats, setDiffStats] = useState({ changes: 0, added: 0, removed: 0, modified: 0 })
  const [currentDiff, setCurrentDiff] = useState(0)
  const [dark, setDark] = useState(true)
  const [path, setPath] = useState('$')
  const [toast, setToast] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') }
    catch { return [] }
  })
  const fileInput = useRef<HTMLInputElement>(null)
  const diffFileInput = useRef<HTMLInputElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const diffDisposablesRef = useRef<monaco.IDisposable[]>([])
  const treeContentRef = useRef<HTMLDivElement>(null)
  const textRef = useRef(text)
  const formatRef = useRef(format)
  const viewRef = useRef(view)
  const scrollDisposableRef = useRef<monaco.IDisposable | null>(null)
  const cursorDisposableRef = useRef<monaco.IDisposable | null>(null)
  const wheelCleanupRef = useRef<(() => void) | null>(null)

  const parsed = useMemo(() => parseDocument(text, format), [text, format])
  const tree = useMemo(() => toTree(parsed), [parsed])
  const diffValues = useMemo(() => {
    if (!normalizeDiff) return { original: text, modified: compareText }
    const normalize = (value: string) => {
      if (!value.trim()) return value
      const valueFormat = detectFormat(value)
      try { return formatDocument(value, valueFormat, false) }
      catch { return value }
    }
    return { original: normalize(text), modified: normalize(compareText) }
  }, [compareText, normalizeDiff, text])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  useEffect(() => {
    if (autoDetect && text.trim()) setFormat(detectFormat(text))
  }, [text, autoDetect])

  useEffect(() => { textRef.current = text }, [text])
  useEffect(() => { formatRef.current = format }, [format])
  useEffect(() => { viewRef.current = view }, [view])

  useEffect(() => {
    setPath(format === 'json' ? '$' : tree?.path ?? '/')
  }, [format])

  useEffect(() => {
    if (view !== 'tree') return
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const rows = treeContentRef.current?.querySelectorAll<HTMLElement>('[data-tree-path]')
        const target = rows ? [...rows].find((row) => row.dataset.treePath === path) : undefined
        target?.scrollIntoView({ block: 'center', behavior: 'auto' })
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [path, view])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const announce = (message: string) => setToast(message)

  const saveHistory = (nextText = text, nextFormat = format, label = '手动快照') => {
    if (!nextText.trim()) return
    const entry = { id: Date.now(), format: nextFormat, text: nextText, label }
    const next = [entry, ...history.filter((item) => item.text !== nextText)].slice(0, 12)
    setHistory(next)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  }

  const runTransform = (compact: boolean) => {
    try {
      const result = formatDocument(text, format, compact)
      setText(result)
      saveHistory(result, format, compact ? '压缩前快照' : '格式化快照')
      announce(compact ? '已压缩文档' : '格式化完成')
    } catch (error) { announce(error instanceof Error ? error.message : '处理失败') }
  }

  const unescape = () => {
    try {
      const result = unescapeText(text)
      saveHistory(text, format, '去转义前快照')
      setText(result)
      if (autoDetect) setFormat(detectFormat(result))
      announce('去转义完成')
    } catch (error) { announce(error instanceof Error ? error.message : '去转义失败') }
  }

  const convert = () => {
    try {
      const result = convertDocument(text, format)
      saveHistory(text, format, `${format.toUpperCase()} 转换前`)
      setText(result.text)
      setFormat(result.format)
      setAutoDetect(false)
      setView('tree')
      announce(`已转换为 ${result.format.toUpperCase()}`)
    } catch (error) { announce(error instanceof Error ? error.message : '转换失败') }
  }

  const copy = async () => {
    await navigator.clipboard.writeText(text)
    announce('内容已复制')
  }

  const download = () => {
    const blob = new Blob([text], { type: format === 'json' ? 'application/json' : 'application/xml' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `document.${format}`
    anchor.click()
    URL.revokeObjectURL(url)
    announce('文件已导出')
  }

  const upload = async (file?: File) => {
    if (!file) return
    const content = await file.text()
    setText(content)
    setFormat(file.name.toLowerCase().endsWith('.xml') ? 'xml' : detectFormat(content))
    saveHistory(content, detectFormat(content), `导入 · ${file.name}`)
    announce(`已导入 ${file.name}`)
  }

  const editorMounted: OnMount = (editor) => {
    editorRef.current = editor
    scrollDisposableRef.current?.dispose()
    cursorDisposableRef.current?.dispose()
    wheelCleanupRef.current?.()
    const syncTreeScroll = () => {
      const treeElement = treeContentRef.current
      if (!treeElement || viewRef.current !== 'tree') return
      const editorMax = Math.max(1, editor.getScrollHeight() - editor.getLayoutInfo().height)
      const treeMax = Math.max(0, treeElement.scrollHeight - treeElement.clientHeight)
      treeElement.scrollTop = (editor.getScrollTop() / editorMax) * treeMax
    }
    scrollDisposableRef.current = editor.onDidScrollChange((event) => {
      if (event.scrollTopChanged) syncTreeScroll()
    })
    const editorElement = editor.getDomNode()
    const handleWheel = () => window.requestAnimationFrame(syncTreeScroll)
    editorElement?.addEventListener('wheel', handleWheel, { passive: true })
    wheelCleanupRef.current = () => editorElement?.removeEventListener('wheel', handleWheel)
    cursorDisposableRef.current = editor.onDidChangeCursorPosition((event) => {
      if (viewRef.current !== 'tree') return
      const model = editor.getModel()
      if (!model) return
      const offset = model.getOffsetAt(event.position)
      setPath(pathAtOffset(textRef.current, formatRef.current, offset))
    })
  }

  const refreshDiffStats = (editor: monaco.editor.IStandaloneDiffEditor) => {
    const changes = editor.getLineChanges() ?? []
    let added = 0
    let removed = 0
    let modified = 0
    for (const change of changes) {
      const originalLines = change.originalEndLineNumber === 0
        ? 0
        : change.originalEndLineNumber - change.originalStartLineNumber + 1
      const modifiedLines = change.modifiedEndLineNumber === 0
        ? 0
        : change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1
      if (originalLines === 0) added += modifiedLines
      else if (modifiedLines === 0) removed += originalLines
      else {
        modified += Math.max(originalLines, modifiedLines)
        if (modifiedLines > originalLines) added += modifiedLines - originalLines
        if (originalLines > modifiedLines) removed += originalLines - modifiedLines
      }
    }
    setDiffStats({ changes: changes.length, added, removed, modified })
    setCurrentDiff((value) => changes.length ? Math.min(Math.max(value, 1), changes.length) : 0)
  }

  const diffEditorMounted: DiffOnMount = (editor) => {
    diffEditorRef.current = editor
    diffDisposablesRef.current.forEach((disposable) => disposable.dispose())
    const originalEditor = editor.getOriginalEditor()
    const modifiedEditor = editor.getModifiedEditor()
    diffDisposablesRef.current = [
      editor.onDidUpdateDiff(() => refreshDiffStats(editor)),
      originalEditor.onDidChangeModelContent(() => setText(originalEditor.getValue())),
      modifiedEditor.onDidChangeModelContent(() => setCompareText(modifiedEditor.getValue())),
    ]
    window.setTimeout(() => refreshDiffStats(editor), 0)
  }

  const navigateDiff = (direction: 1 | -1) => {
    const editor = diffEditorRef.current
    const changes = editor?.getLineChanges() ?? []
    if (!editor || !changes.length) return announce('当前没有差异')
    const next = currentDiff <= 0
      ? direction === 1 ? 1 : changes.length
      : ((currentDiff - 1 + direction + changes.length) % changes.length) + 1
    const change = changes[next - 1]
    const originalLine = Math.max(1, change.originalStartLineNumber)
    const modifiedLine = Math.max(1, change.modifiedStartLineNumber)
    editor.getOriginalEditor().setPosition({ lineNumber: originalLine, column: 1 })
    editor.getModifiedEditor().setPosition({ lineNumber: modifiedLine, column: 1 })
    editor.getOriginalEditor().revealLineInCenter(originalLine)
    editor.getModifiedEditor().revealLineInCenter(modifiedLine)
    setCurrentDiff(next)
  }

  const uploadDiffFile = async (file?: File) => {
    if (!file) return
    setCompareText(await file.text())
    announce(`已载入右侧文档 · ${file.name}`)
  }

  const selectTreeNode = (node: TreeNode) => {
    setPath(node.path)
    const needle = format === 'json' ? `"${node.label}"` : node.label.replace(/^@/, '')
    const model = editorRef.current?.getModel()
    const match = model?.findMatches(needle, false, false, false, null, false)[0]
    if (match) {
      editorRef.current?.revealLineInCenter(match.range.startLineNumber)
      editorRef.current?.setSelection(match.range)
    }
  }

  const copyTreeContent = async (value: string, kind: '属性' | '值') => {
    await navigator.clipboard.writeText(value)
    announce(`已复制${kind} · ${value.length > 28 ? `${value.slice(0, 28)}…` : value}`)
  }

  const leftLines = text.split('\n').length
  const bytes = new Blob([text]).size

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><span>{'{·}'}</span></div>
          <div><strong>Structura</strong><small>JSON & XML STUDIO</small></div>
        </div>
        <div className="format-switch" role="group" aria-label="文档格式">
          {(['json', 'xml'] as Format[]).map((item) => (
            <button key={item} className={format === item ? 'active' : ''} onClick={() => { setFormat(item); setAutoDetect(false) }}>
              {item.toUpperCase()}
            </button>
          ))}
          <label className="auto-detect">
            <input type="checkbox" checked={autoDetect} onChange={(event) => setAutoDetect(event.target.checked)} />
            自动识别
          </label>
        </div>
        <div className="top-actions">
          <span className={`privacy-badge ${parsed.ok ? '' : 'invalid'}`}><i />{parsed.ok ? '仅本地处理' : '文档有错误'}</span>
          <button className="icon-button" onClick={() => setDark((value) => !value)} title="切换主题"><Icon name="theme" /></button>
          <button className="primary small" onClick={() => saveHistory()}><span>+</span> 保存快照</button>
        </div>
      </header>

      <section className={`workspace ${view === 'diff' ? 'diff-mode' : ''}`}>
        <aside className="command-rail">
          <div className="rail-section">
            <span className="rail-title">处理</span>
            <button onClick={() => runTransform(false)}><Icon name="format" /><span>格式化</span></button>
            <button onClick={() => runTransform(true)}><Icon name="compact" /><span>压缩</span></button>
            <button onClick={unescape}><Icon name="unescape" /><span>去转义</span></button>
            <button onClick={() => announce(parsed.ok ? `${format.toUpperCase()} 文档有效` : parsed.error || '文档无效')}><Icon name="validate" /><span>校验</span></button>
            <button onClick={convert}><Icon name="convert" /><span>转为 {format === 'json' ? 'XML' : 'JSON'}</span></button>
          </div>
          <div className="rail-section">
            <span className="rail-title">文件</span>
            <button onClick={() => fileInput.current?.click()}><Icon name="upload" /><span>导入文件</span></button>
            <button onClick={download}><Icon name="download" /><span>导出文件</span></button>
            <button onClick={copy}><Icon name="copy" /><span>复制内容</span></button>
            <button className="danger" onClick={() => { saveHistory(text, format, '清空前快照'); setText('') }}><Icon name="clear" /><span>清空</span></button>
          </div>
          <input ref={fileInput} hidden type="file" accept=".json,.xml,application/json,application/xml,text/xml" onChange={(event) => upload(event.target.files?.[0])} />
        </aside>

        <section className="editor-panel">
          <div className="panel-heading">
            <div><span className={`status-dot ${parsed.ok ? '' : 'error'}`} />输入文档</div>
            <span>{format.toUpperCase()}</span>
          </div>
          <div className="editor-wrap" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); upload(event.dataTransfer.files[0]) }}>
            <Editor
              height="100%"
              language={format}
              value={text}
              onChange={(value) => setText(value ?? '')}
              onMount={editorMounted}
              theme={dark ? 'vs-dark' : 'light'}
              options={{
                minimap: { enabled: false }, fontSize: 14, lineHeight: 23, fontLigatures: true,
                wordWrap: 'on', stickyScroll: { enabled: true }, automaticLayout: true,
                padding: { top: 14 }, scrollBeyondLastLine: false, renderLineHighlight: 'gutter',
              }}
            />
          </div>
          <div className={`editor-status ${parsed.ok ? '' : 'error'}`}>
            <span>{parsed.ok ? '✓ 语法有效' : `! ${parsed.error}`}</span>
            <span>{parsed.line ? `行 ${parsed.line}${parsed.column ? `，列 ${parsed.column}` : ''}` : `${leftLines} 行`}</span>
            <span>{bytes < 1024 ? bytes : (bytes / 1024).toFixed(1)} {bytes < 1024 ? 'B' : 'KB'}</span>
          </div>
        </section>

        <section className="result-panel">
          <nav className="view-tabs">
            <button className={view === 'tree' ? 'active' : ''} onClick={() => setView('tree')}><Icon name="tree" />树视图</button>
            <button className={view === 'source' ? 'active' : ''} onClick={() => setView('source')}><Icon name="code" />转换预览</button>
            <button className={view === 'diff' ? 'active' : ''} onClick={() => setView('diff')}><Icon name="diff" />比较</button>
            <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}><Icon name="history" />历史</button>
          </nav>

          {view === 'tree' && (
            <div className="tree-view">
              <div className="tree-toolbar">
                <div className="search-box">⌕ <input placeholder={`搜索 ${format === 'json' ? 'Key / Value' : '标签 / 属性'}`} /></div>
                <span>{tree?.children?.length ?? 0} 个顶层节点</span>
              </div>
              <div className="tree-content" ref={treeContentRef}>
                {tree ? <TreeRow node={tree} selected={path} onSelect={selectTreeNode} onCopy={copyTreeContent} /> : (
                  <div className="empty-state"><b>无法生成树</b><span>修正文档错误后将在这里显示结构</span></div>
                )}
              </div>
              <div className="path-bar"><span>{format === 'json' ? 'JSONPath' : 'XPath'}</span><code>{path}</code><button onClick={() => navigator.clipboard.writeText(path)}>复制</button></div>
            </div>
          )}

          {view === 'source' && (
            <div className="preview-view">
              <div className="preview-head"><div><b>{format === 'json' ? 'XML' : 'JSON'} 转换预览</b><small>转换采用可逆友好的 @attribute / #text 约定</small></div><button className="primary small" onClick={convert}>应用转换</button></div>
              <Editor
                height="calc(100% - 66px)"
                language={format === 'json' ? 'xml' : 'json'}
                value={(() => { try { return convertDocument(text, format).text } catch { return '文档有效后显示转换结果' } })()}
                theme={dark ? 'vs-dark' : 'light'}
                options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, wordWrap: 'on', automaticLayout: true, padding: { top: 14 } }}
              />
            </div>
          )}

          {view === 'diff' && (
            <div className="diff-view">
              <div className="diff-toolbar">
                <div className="diff-file-labels">
                  <span><i className="old" />原始文档 <em>{normalizeDiff ? '规范化预览' : '可直接输入'}</em></span>
                  <span><i className="new" />对比文档 <em>{normalizeDiff ? '规范化预览' : '可直接输入'}</em></span>
                </div>
                <div className="diff-actions">
                  <button onClick={() => diffFileInput.current?.click()}>↑ 载入右侧</button>
                  <button onClick={() => { setText(compareText); setCompareText(text); announce('已交换左右文档') }}>⇄ 交换</button>
                  <button onClick={() => setText('')}>× 清空左侧</button>
                  <button onClick={() => setCompareText('')}>× 清空右侧</button>
                  <span className="diff-divider" />
                  <label><input type="checkbox" checked={normalizeDiff} onChange={(event) => setNormalizeDiff(event.target.checked)} />格式化后比较</label>
                  <label><input type="checkbox" checked={ignoreWhitespace} onChange={(event) => setIgnoreWhitespace(event.target.checked)} />忽略空白</label>
                  <button className={sideBySide ? 'active' : ''} onClick={() => setSideBySide(true)}>并排</button>
                  <button className={!sideBySide ? 'active' : ''} onClick={() => setSideBySide(false)}>单栏</button>
                </div>
                <input ref={diffFileInput} hidden type="file" accept=".json,.xml,.txt,application/json,application/xml,text/*" onChange={(event) => uploadDiffFile(event.target.files?.[0])} />
              </div>
              <div className="diff-editor-wrap">
                <DiffEditor
                  height="100%"
                  language={format}
                  original={diffValues.original}
                  modified={diffValues.modified}
                  onMount={diffEditorMounted}
                  theme={dark ? 'vs-dark' : 'light'}
                  options={{
                    automaticLayout: true,
                    renderSideBySide: sideBySide,
                    ignoreTrimWhitespace: ignoreWhitespace,
                    originalEditable: !normalizeDiff,
                    readOnly: normalizeDiff,
                    renderIndicators: true,
                    renderMarginRevertIcon: true,
                    diffWordWrap: 'on',
                    wordWrap: 'on',
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineHeight: 21,
                    scrollBeyondLastLine: false,
                    stickyScroll: { enabled: true },
                    padding: { top: 10 },
                    hideUnchangedRegions: { enabled: false },
                    diffAlgorithm: 'advanced',
                  }}
                />
                {!compareText && (
                  <div className="diff-empty-hint">
                    <b>把另一份文档粘贴到右侧</b>
                    <span>也可以使用“载入右侧”导入 JSON、XML 或文本文件</span>
                  </div>
                )}
              </div>
              <div className="diff-statusbar">
                <div className="diff-summary">
                  <span className="added">+{diffStats.added} 新增</span>
                  <span className="removed">−{diffStats.removed} 删除</span>
                  <span className="modified">~{diffStats.modified} 修改</span>
                </div>
                <span>{normalizeDiff ? '规范化比较' : `${format.toUpperCase()} 文本比较`} · 字符级定位</span>
                <div className="diff-nav">
                  <button onClick={() => navigateDiff(-1)} title="上一处差异">↑</button>
                  <strong>{diffStats.changes ? `${currentDiff || 1} / ${diffStats.changes}` : '0 / 0'}</strong>
                  <button onClick={() => navigateDiff(1)} title="下一处差异">↓</button>
                </div>
              </div>
            </div>
          )}

          {view === 'history' && (
            <div className="history-view">
              <div className="history-head"><div><b>本地历史</b><small>最多保存 12 条，仅存储在当前浏览器</small></div><button onClick={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY) }}>清除记录</button></div>
              {history.length ? history.map((entry) => (
                <button className="history-card" key={entry.id} onClick={() => { setText(entry.text); setFormat(entry.format); announce('已恢复快照') }}>
                  <span className="history-format">{entry.format.toUpperCase()}</span>
                  <div><b>{entry.label}</b><small>{new Date(entry.id).toLocaleString('zh-CN')} · {entry.text.split('\n').length} 行</small></div>
                  <span>恢复 →</span>
                </button>
              )) : <div className="empty-state"><b>还没有历史记录</b><span>点击右上角“保存快照”开始记录</span></div>}
            </div>
          )}
        </section>
      </section>

      <footer className="footer"><span><i />所有解析均在浏览器本地完成</span><span>Structura v0.1 · JSON / XML</span></footer>
      {toast && <div className="toast">{toast}</div>}
    </main>
  )
}

export default App
