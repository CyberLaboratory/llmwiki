'use client'

import * as React from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight, FileText, NotepadText, Library,
  Upload, BookOpen, ArrowUpRight, Search as SearchIcon,
  Lightbulb, Box, ScrollText, Network, Folder,
  Plus, Pencil, FolderInput, LayoutGrid,
} from 'lucide-react'
import {
  CommandDialog, CommandInput, CommandList, CommandItem,
  CommandEmpty, CommandGroup, CommandSeparator,
} from '@/components/ui/command'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { WikiSelector } from '@/components/kb/WikiSelector'
import { SidenavUserMenu } from '@/components/kb/SidenavUserMenu'
import { apiFetch } from '@/lib/api'
import { useUserStore } from '@/stores'
import type { DocumentListItem, WikiNode } from '@/lib/types'

interface Usage {
  total_pages: number
  total_storage_bytes: number
  document_count: number
  max_pages: number
  max_storage_bytes: number
}

interface KBSidenavProps {
  kbId: string
  kbName: string
  wikiTree: WikiNode[]
  wikiActivePath: string | null
  onWikiNavigate: (path: string, docNumber?: number | null) => void
  sourceDocs: DocumentListItem[]
  hasWiki: boolean
  loading: boolean
  onUpload: () => void
  filesViewActive: boolean
  onFilesToggle: () => void
  graphViewActive: boolean
  onGraphToggle: () => void
  onOpenSourceDoc: (docId: string) => void
  onCreateWikiNote: (title: string, folder: string) => void
  onRenameWikiNote: (path: string, newTitle: string) => void
  onMoveWikiNote: (path: string, newFolder: string) => void
  wikiSubfolders: string[]
}

export function KBSidenav({
  kbId,
  kbName,
  wikiTree,
  wikiActivePath,
  onWikiNavigate,
  sourceDocs,
  hasWiki,
  loading,
  onUpload,
  filesViewActive,
  onFilesToggle,
  graphViewActive,
  onGraphToggle,
  onOpenSourceDoc,
  onCreateWikiNote,
  onRenameWikiNote,
  onMoveWikiNote,
  wikiSubfolders,
}: KBSidenavProps) {
  const [searchOpen, setSearchOpen] = React.useState(false)

  // New Note dialog state
  const [newNoteOpen, setNewNoteOpen] = React.useState(false)
  const [newNoteTitle, setNewNoteTitle] = React.useState('')
  const [newNoteFolder, setNewNoteFolder] = React.useState('')

  // Rename dialog state
  const [renameState, setRenameState] = React.useState<{ path: string; title: string } | null>(null)
  const [renameValue, setRenameValue] = React.useState('')

  // Move dialog state
  const [moveState, setMoveState] = React.useState<{ path: string } | null>(null)
  const [moveFolder, setMoveFolder] = React.useState('')

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const isMac = React.useMemo(() =>
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent),
  [])

  const allSearchableItems = React.useMemo(() => {
    const items: { type: 'wiki' | 'source'; title: string; keywords: string; tags: string[]; path?: string; docNumber?: number | null; doc?: DocumentListItem }[] = []
    const addWikiNodes = (nodes: WikiNode[], parentPath = '') => {
      for (const node of nodes) {
        if (node.path) {
          const matchingDoc = sourceDocs.find((d) => d.path === '/wiki/' && d.filename === node.path?.split('/').pop())
          const tags = matchingDoc?.tags ?? []
          items.push({
            type: 'wiki',
            title: node.title,
            keywords: [node.title, node.path, parentPath, ...tags].filter(Boolean).join(' '),
            tags,
            path: node.path,
            docNumber: node.docNumber,
          })
        }
        if (node.children) addWikiNodes(node.children, node.title)
      }
    }
    addWikiNodes(wikiTree)
    for (const doc of sourceDocs) {
      const tags = doc.tags ?? []
      items.push({
        type: 'source',
        title: doc.title || doc.filename,
        keywords: [doc.title, doc.filename, doc.path, doc.file_type, ...tags].filter(Boolean).join(' '),
        tags,
        doc,
      })
    }
    return items
  }, [wikiTree, sourceDocs])

  const sourceCount = sourceDocs.length

  const handleNewNoteSubmit = () => {
    if (!newNoteTitle.trim()) return
    onCreateWikiNote(newNoteTitle.trim(), newNoteFolder.trim())
    setNewNoteOpen(false)
    setNewNoteTitle('')
    setNewNoteFolder('')
  }

  const handleRenameSubmit = () => {
    if (!renameState || !renameValue.trim()) return
    onRenameWikiNote(renameState.path, renameValue.trim())
    setRenameState(null)
    setRenameValue('')
  }

  const handleMoveSubmit = () => {
    if (!moveState) return
    onMoveWikiNote(moveState.path, moveFolder.trim())
    setMoveState(null)
    setMoveFolder('')
  }

  return (
    <div className="h-full flex flex-col border-r border-border">
      {/* Back to all wikis */}
      <div className="shrink-0 px-3 pt-2.5 pb-0">
        <Link
          href="/wikis"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          <LayoutGrid className="size-2.5" />
          All Wikis
        </Link>
      </div>

      {/* Wiki selector */}
      <div className="shrink-0 px-2 pt-1 pb-1">
        <WikiSelector kbId={kbId} kbName={kbName} />
      </div>

      {/* Search + Upload + Graph */}
      <div className="shrink-0 px-2 pb-1 flex items-center gap-1.5">
        <button
          onClick={() => setSearchOpen(true)}
          aria-label="Search pages and sources"
          className="flex items-center gap-2 flex-1 px-2.5 py-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground border border-border hover:bg-accent rounded-md transition-colors cursor-pointer"
        >
          <SearchIcon className="size-3" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="text-[10px] text-muted-foreground/30 bg-muted px-1 rounded">{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
        </button>
        <button
          onClick={onGraphToggle}
          className={cn(
            'flex items-center justify-center px-2.5 py-1.5 border rounded-md transition-colors cursor-pointer',
            graphViewActive
              ? 'bg-accent text-foreground border-border'
              : 'text-muted-foreground/50 hover:text-muted-foreground border-border hover:bg-accent',
          )}
          title="Knowledge graph"
        >
          <Network className="size-3" />
        </button>
        <button
          onClick={onUpload}
          className="flex items-center justify-center px-2.5 py-1.5 text-muted-foreground/50 hover:text-muted-foreground border border-border hover:bg-accent rounded-md transition-colors cursor-pointer"
          title="Upload files"
        >
          <Upload className="size-3" />
        </button>
      </div>

      {/* Search palette */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Jump to page, source, or action..." aria-label="Search pages and sources" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {allSearchableItems.some((i) => i.type === 'wiki') && (
            <CommandGroup heading="Wiki">
              {allSearchableItems.filter((i) => i.type === 'wiki').map((item) => (
                <CommandItem
                  key={`wiki-${item.path}`}
                  value={item.keywords}
                  onSelect={() => {
                    setSearchOpen(false)
                    if (item.path) onWikiNavigate(item.path, item.docNumber)
                  }}
                  className="flex items-center"
                >
                  <FileText className="size-3.5 mr-2 opacity-50 shrink-0" />
                  <span className="truncate">{item.title}</span>
                  {item.tags.length > 0 && (
                    <span className="ml-auto flex items-center gap-1 shrink-0 pl-2">
                      {item.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-[10px] text-muted-foreground/50 bg-muted px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {allSearchableItems.some((i) => i.type === 'source') && (
            <CommandGroup heading="Sources">
              {allSearchableItems.filter((i) => i.type === 'source').map((item) => (
                <CommandItem
                  key={`source-${item.doc?.id}`}
                  value={item.keywords}
                  onSelect={() => {
                    setSearchOpen(false)
                    if (item.doc) onOpenSourceDoc(item.doc.id)
                  }}
                  className="flex items-center"
                >
                  <NotepadText className="size-3.5 mr-2 opacity-50 shrink-0" />
                  <span className="truncate">{item.title}</span>
                  {item.tags.length > 0 && (
                    <span className="ml-auto flex items-center gap-1 shrink-0 pl-2">
                      {item.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-[10px] text-muted-foreground/50 bg-muted px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => { setSearchOpen(false); setNewNoteOpen(true) }}>
              <Plus className="size-3.5 mr-2 opacity-50" />
              New Wiki Note
            </CommandItem>
            <CommandItem onSelect={() => { setSearchOpen(false); onFilesToggle() }}>
              <Folder className="size-3.5 mr-2 opacity-50" />
              Browse Files
            </CommandItem>
            <CommandItem onSelect={() => { setSearchOpen(false); onUpload() }}>
              <Upload className="size-3.5 mr-2 opacity-50" />
              Upload Files
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* Wiki tree */}
      <div className="flex-1 min-h-0 flex flex-col px-2 pt-1">
        <div className="flex items-center px-2 mb-1 shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 flex-1">
            Wiki
          </span>
          <button
            onClick={() => setNewNoteOpen(true)}
            className="p-0.5 rounded text-muted-foreground/30 hover:text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
            title="New wiki note"
          >
            <Plus className="size-3" />
          </button>
        </div>
        {loading ? (
          <SidenavSkeleton lines={3} />
        ) : hasWiki ? (
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {wikiTree.map((node, i) => (
              <WikiTreeNode
                key={node.path ?? node.title ?? i}
                node={node}
                depth={0}
                activePath={wikiActivePath}
                onNavigate={onWikiNavigate}
                onRenameRequest={(path, title) => { setRenameState({ path, title }); setRenameValue(title) }}
                onMoveRequest={(path) => { setMoveState({ path }); setMoveFolder('') }}
              />
            ))}
          </div>
        ) : (
          <div className="px-2 py-4 text-center">
            <BookOpen className="size-6 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground mb-2">No wiki yet</p>
            <a
              href="https://claude.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Open Claude
              <ArrowUpRight className="size-3" />
            </a>
          </div>
        )}
      </div>

      {/* Sources button */}
      <div className="shrink-0 px-2 pb-1">
        <button
          onClick={onFilesToggle}
          className={cn(
            'flex items-center gap-2 w-full px-2.5 py-2 text-[13px] rounded-md transition-colors cursor-pointer',
            filesViewActive
              ? 'bg-accent text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
          )}
        >
          <Library className="size-3.5" />
          <span className="flex-1 text-left">Sources</span>
          {sourceCount > 0 && (
            <span className="text-[10px] text-muted-foreground/30">{sourceCount}</span>
          )}
        </button>
      </div>

      {/* User menu */}
      <div className="shrink-0 border-t border-border p-2">
        <SidenavUserMenu />
      </div>

      {/* New Note dialog */}
      <Dialog open={newNoteOpen} onOpenChange={(v) => { setNewNoteOpen(v); if (!v) { setNewNoteTitle(''); setNewNoteFolder('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New wiki note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Title</label>
              <input
                value={newNoteTitle}
                onChange={(e) => setNewNoteTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleNewNoteSubmit()}
                placeholder="My note title"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Folder (optional)</label>
              <input
                list="wiki-folders"
                value={newNoteFolder}
                onChange={(e) => setNewNoteFolder(e.target.value)}
                placeholder="concepts, entities, ..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
              <datalist id="wiki-folders">
                {wikiSubfolders.map((f) => <option key={f} value={f} />)}
              </datalist>
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setNewNoteOpen(false)}
              className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-accent cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleNewNoteSubmit}
              disabled={!newNoteTitle.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              Create
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameState} onOpenChange={(v) => { if (!v) setRenameState(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename note</DialogTitle>
          </DialogHeader>
          <input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            autoFocus
          />
          <DialogFooter>
            <button
              onClick={() => setRenameState(null)}
              className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-accent cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleRenameSubmit}
              disabled={!renameValue.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              Rename
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move dialog */}
      <Dialog open={!!moveState} onOpenChange={(v) => { if (!v) setMoveState(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move note</DialogTitle>
          </DialogHeader>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">New folder (leave blank for wiki root)</label>
            <input
              list="wiki-folders-move"
              value={moveFolder}
              onChange={(e) => setMoveFolder(e.target.value)}
              placeholder="concepts, entities, ..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              autoFocus
            />
            <datalist id="wiki-folders-move">
              {wikiSubfolders.map((f) => <option key={f} value={f} />)}
            </datalist>
          </div>
          <DialogFooter>
            <button
              onClick={() => setMoveState(null)}
              className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-accent cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleMoveSubmit}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 cursor-pointer"
            >
              Move
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SidenavSkeleton({ lines }: { lines: number }) {
  return (
    <div className="space-y-1 px-2 py-1">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-5 rounded-md bg-muted/50 animate-pulse"
          style={{ width: `${60 + Math.random() * 30}%` }}
        />
      ))}
    </div>
  )
}

function wikiNodeIcon(node: WikiNode, depth: number) {
  const slug = node.path?.replace(/\.(md|txt|json)$/, '').split('/')[0] ?? ''
  const titleLower = node.title.toLowerCase()
  const hasChildren = node.children && node.children.length > 0

  if (slug === 'overview' || (depth === 0 && titleLower === 'overview'))
    return <BookOpen className="size-3 shrink-0 opacity-60" />
  if (slug === 'log' || (depth === 0 && titleLower === 'log'))
    return <ScrollText className="size-3 shrink-0 opacity-60" />
  if (slug === 'concepts' || (depth === 0 && titleLower === 'concepts'))
    return <Lightbulb className="size-3 shrink-0 opacity-60" />
  if (slug === 'entities' || (depth === 0 && titleLower === 'entities'))
    return <Box className="size-3 shrink-0 opacity-60" />

  if (hasChildren)
    return <Folder className="size-3 shrink-0 opacity-50" />

  if (depth > 0)
    return <FileText className="size-3 shrink-0 opacity-40" />

  return <FileText className="size-3 shrink-0 opacity-50" />
}

function WikiTreeNode({
  node,
  depth,
  activePath,
  onNavigate,
  onRenameRequest,
  onMoveRequest,
}: {
  node: WikiNode
  depth: number
  activePath: string | null
  onNavigate: (path: string, docNumber?: number | null) => void
  onRenameRequest: (path: string, title: string) => void
  onMoveRequest: (path: string) => void
}) {
  const hasChildren = node.children && node.children.length > 0
  const isActive = node.path != null && node.path === activePath
  const hasActiveChild = hasChildren && node.children!.some((c) => c.path === activePath)
  const [expanded, setExpanded] = React.useState(true)

  return (
    <div>
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'group flex items-center gap-1.5 w-full text-left text-[13px] rounded-md px-2 py-1.5 transition-colors cursor-pointer',
            isActive
              ? 'bg-accent text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => {
            if (node.path) {
              onNavigate(node.path, node.docNumber)
            } else if (hasChildren) {
              const first = node.children!.find((c) => c.path)
              if (first) onNavigate(first.path!, first.docNumber)
            }
          }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded((prev) => !prev) }}
              className="p-0.5 -ml-0.5 cursor-pointer"
            >
              <ChevronRight
                className={cn(
                  'size-2.5 transition-transform duration-150',
                  expanded && 'rotate-90',
                )}
              />
            </button>
          ) : (
            <span className="w-3.5" />
          )}
          {wikiNodeIcon(node, depth)}
          <span className="truncate flex-1 min-w-0">{node.title}</span>
        </div>
      </ContextMenuTrigger>
      {node.path && (
        <ContextMenuContent className="w-36">
          <ContextMenuItem onClick={() => onRenameRequest(node.path!, node.title)}>
            <Pencil className="size-3.5 mr-2 opacity-60" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onMoveRequest(node.path!)}>
            <FolderInput className="size-3.5 mr-2 opacity-60" />
            Move
          </ContextMenuItem>
        </ContextMenuContent>
      )}
    </ContextMenu>
    <AnimatePresence initial={false}>
      {hasChildren && (expanded || hasActiveChild) && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
          style={{ overflow: 'hidden' }}
        >
          {node.children!.map((child, i) => (
            <WikiTreeNode
              key={child.path ?? child.title ?? i}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              onNavigate={onNavigate}
              onRenameRequest={onRenameRequest}
              onMoveRequest={onMoveRequest}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  )
}


function PageUsageBar() {
  const token = useUserStore((s) => s.accessToken)
  const [usage, setUsage] = React.useState<Usage | null>(null)
  const [modalOpen, setModalOpen] = React.useState(false)

  React.useEffect(() => {
    if (!token) return
    apiFetch<Usage>('/v1/usage', token)
      .then(setUsage)
      .catch(() => {})
  }, [token])

  if (!usage) return null

  const pct = Math.min(100, (usage.total_pages / usage.max_pages) * 100)
  const color =
    pct > 90 ? 'bg-destructive' : pct > 70 ? 'bg-yellow-500' : 'bg-primary'

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-2 w-full px-2 py-1 rounded-md hover:bg-accent transition-colors cursor-pointer group"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
              Pages
            </span>
            <span className="text-[10px] font-mono text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors">
              {usage.total_pages} / {usage.max_pages}
            </span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', color)}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </button>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Page Usage</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              You've used <span className="font-medium text-foreground">{usage.total_pages.toLocaleString()}</span> of
              your <span className="font-medium text-foreground">{usage.max_pages.toLocaleString()}</span> page limit.
            </p>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', color)}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p>
              Each PDF or office document consumes pages based on its length. Notes and wiki pages are free and unlimited.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Individual documents are limited to 300 pages. Need more capacity? Contact us.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
