import { memo, useEffect, useMemo, useRef } from 'react'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { TreeNode } from '../lib/document'

type GraphCardData = Record<string, unknown> & {
  treeNode: TreeNode
  selectedPath: string
  onSelect: (node: TreeNode) => void
  isRoot: boolean
}

type GraphCardNode = Node<GraphCardData, 'card'>

const CARD_WIDTH = 286
const HEADER_HEIGHT = 42
const ROW_HEIGHT = 31
const LEVEL_GAP = 390
const NODE_GAP = 32

function displayValue(node: TreeNode) {
  if (node.value !== undefined) return node.value
  if (node.type.startsWith('array')) return `[${node.children?.length ?? 0}]`
  if (node.type.startsWith('object')) return `{${node.children?.length ?? 0}}`
  return node.type
}

const GraphCard = memo(({ data }: NodeProps<GraphCardNode>) => {
  const { treeNode, selectedPath, onSelect, isRoot } = data
  const rows = treeNode.children?.length ? treeNode.children : [treeNode]

  return (
    <div className={`graph-card ${selectedPath === treeNode.path ? 'selected' : ''}`}>
      {!isRoot && (
        <Handle type="target" position={Position.Left} className="graph-handle" />
      )}
      <div
        className="graph-card-head"
        onClick={() => onSelect(treeNode)}
        onKeyDown={(event) => { if (event.key === 'Enter') onSelect(treeNode) }}
        role="button"
        tabIndex={0}
        title={`${treeNode.path}（拖拽标题移动节点）`}
      >
        <span>{treeNode.label}</span>
        <small>{treeNode.type}</small>
        {treeNode.value !== undefined && <em>{treeNode.value}</em>}
      </div>
      <div className="graph-card-body">
        {rows.map((child) => {
          const hasGraphChild = Boolean(child.children?.length)
          return (
            <div key={child.id} className={`graph-card-row ${selectedPath === child.path ? 'selected' : ''}`}>
              <button className="nodrag" onClick={() => onSelect(child)} title={child.path}>
                <span>{child === treeNode ? 'value' : child.label}</span>
                <b>{displayValue(child)}</b>
              </button>
              {hasGraphChild && (
                <Handle
                  type="source"
                  id={child.path}
                  position={Position.Right}
                  className="graph-handle"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})

GraphCard.displayName = 'GraphCard'

function buildGraph(tree: TreeNode, selectedPath: string, onSelect: (node: TreeNode) => void) {
  const nodes: GraphCardNode[] = []
  const edges: Edge[] = []

  const placeNode = (node: TreeNode, depth: number, top: number): number => {
    const rows = node.children?.length || 1
    const cardHeight = HEADER_HEIGHT + rows * ROW_HEIGHT
    nodes.push({
      id: node.id,
      type: 'card',
      position: { x: depth * LEVEL_GAP, y: top },
      data: { treeNode: node, selectedPath, onSelect, isRoot: depth === 0 },
      draggable: true,
      deletable: false,
    })

    const graphChildren = node.children?.filter((child) => child.children?.length) ?? []
    let childTop = top
    for (const child of graphChildren) {
      const subtreeHeight = placeNode(child, depth + 1, childTop)
      edges.push({
        id: `${node.id}->${child.id}`,
        source: node.id,
        sourceHandle: child.path,
        target: child.id,
        type: 'bezier',
        selectable: false,
        focusable: false,
      })
      childTop += subtreeHeight + NODE_GAP
    }

    const childrenHeight = graphChildren.length ? childTop - top - NODE_GAP : 0
    return Math.max(cardHeight, childrenHeight)
  }

  placeNode(tree, 0, 0)
  return { nodes, edges }
}

function GraphCanvas({ tree, selectedPath, onSelect, dark }: {
  tree: TreeNode
  selectedPath: string
  onSelect: (node: TreeNode) => void
  dark: boolean
}) {
  const initialGraph = useMemo(() => buildGraph(tree, selectedPath, onSelect), [tree])
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphCardNode>(initialGraph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges)
  const { fitView, getNodes, getZoom, setCenter } = useReactFlow<GraphCardNode>()
  const lastLocatedPath = useRef(selectedPath)

  useEffect(() => {
    const graph = buildGraph(tree, selectedPath, onSelect)
    setNodes(graph.nodes)
    setEdges(graph.edges)
    const frame = window.requestAnimationFrame(() => fitView({ padding: 0.16, duration: 260, maxZoom: 1.15 }))
    return () => window.cancelAnimationFrame(frame)
  }, [fitView, setEdges, setNodes, tree])

  useEffect(() => {
    setNodes((current) => current.map((node) => ({
      ...node,
      data: { ...node.data, selectedPath, onSelect },
    })))
    if (lastLocatedPath.current === selectedPath) return
    lastLocatedPath.current = selectedPath
    const frame = window.requestAnimationFrame(() => {
      const currentNodes = getNodes()
      const exactNode = currentNodes.find((node) => node.data.treeNode.path === selectedPath)
      const rowNode = exactNode ?? currentNodes.find((node) => (
        node.data.treeNode.children?.some((child) => child.path === selectedPath)
      ))
      if (!rowNode) return
      const width = rowNode.measured?.width ?? CARD_WIDTH
      const height = rowNode.measured?.height ?? HEADER_HEIGHT + ROW_HEIGHT
      const rowIndex = exactNode
        ? -1
        : rowNode.data.treeNode.children?.findIndex((child) => child.path === selectedPath) ?? -1
      const targetY = rowIndex >= 0
        ? rowNode.position.y + HEADER_HEIGHT + rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2
        : rowNode.position.y + height / 2
      setCenter(rowNode.position.x + width / 2, targetY, {
        zoom: Math.max(getZoom(), 0.75),
        duration: 320,
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [getNodes, getZoom, onSelect, selectedPath, setCenter, setNodes])

  return (
    <ReactFlow<GraphCardNode>
      nodes={nodes}
      edges={edges}
      nodeTypes={{ card: GraphCard }}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
      panOnDrag
      panOnScroll
      zoomOnScroll
      zoomOnPinch
      zoomOnDoubleClick={false}
      minZoom={0.25}
      maxZoom={2}
      colorMode={dark ? 'dark' : 'light'}
      fitView
      fitViewOptions={{ padding: 0.16, maxZoom: 1.15 }}
      defaultEdgeOptions={{ style: { strokeWidth: 1.4 } }}
    >
      <Background gap={18} size={1} />
      <Controls showInteractive={false} />
      <div className="graph-hint">拖拽卡片标题 · 拖动画布 · 滚轮缩放</div>
    </ReactFlow>
  )
}

export default function GraphView(props: {
  tree: TreeNode
  selectedPath: string
  onSelect: (node: TreeNode) => void
  dark: boolean
}) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  )
}
