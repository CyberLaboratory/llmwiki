'use client'

import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import type { Components } from 'react-markdown'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FileText, Copy, Download, Check, Network, Link2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import { useUserStore } from '@/stores'
import { MermaidBlock } from './MermaidBlock'
import { ExpandableMedia } from './DiagramViewer'
import type { DocumentListItem } from '@/lib/types'

export interface TocItem {
  id: string
  text: string
  level: 2 | 3
}

export function extractTocFromMarkdown(md: string): TocItem[] {
  const items: TocItem[] = []
  const lines = md.split('\n')
  for (const line of lines) {
    const m2 = line.match(/^##\s+(.+)/)
    const m3 = line.match(/^###\s+(.+)/)
    if (m2) {
      const text = m2[1].replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim()
      items.push({ id: slugify(text), text, level: 2 })
    } else if (m3) {
      const text = m3[1].replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim()
      items.push({ id: slugify(text), text, level: 3 })
    }
  }
  return items
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function stripLeadingH1(content: string, title: string): string {
  const trimmed = content.trimStart()
  const match = trimmed.match(/^#\s+(.+)\n?/)
  if (match) {
    const h1Text = match[1].replace(/\*\*/g, '').trim()
    const normalizedH1 = h1Text.toLowerCase().replace(/[^\w\s]/g, '').trim()
    const normalizedTitle = title.toLowerCase().replace(/[^\w\s]/g, '').trim()
    if (normalizedH1 === normalizedTitle) {
      return trimmed.slice(match[0].length)
    }
  }
  return content
}

function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (items.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first visible heading
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) {
          setActiveId(visible[0].target.id)
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    )

    // Small delay to ensure headings are rendered
    const timeout = setTimeout(() => {
      for (const item of items) {
        const el = document.getElementById(item.id)
        if (el) observer.observe(el)
      }
    }, 100)

    return () => {
      clearTimeout(timeout)
      observer.disconnect()
    }
  }, [items])

  if (items.length === 0) return null

  return (
    <nav className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-2 px-1">
        On this page
      </p>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          onClick={(e) => {
            e.preventDefault()
            const el = document.getElementById(item.id)
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'start' })
              setActiveId(item.id)
            }
          }}
          className={cn(
            'block text-xs leading-snug py-1 px-1 rounded transition-colors',
            item.level === 3 && 'pl-4',
            activeId === item.id
              ? 'text-foreground font-medium'
              : 'text-muted-foreground/60 hover:text-muted-foreground',
          )}
        >
          {item.text}
        </a>
      ))}
    </nav>
  )
}

function parseFootnoteSources(content: string): Map<string, string> {
  const map = new Map<string, string>()
  // Match footnote definitions: [^1]: full source text until end of line
  const regex = /\[\^(\d+)\]:\s*(.+)$/gm
  let m
  while ((m = regex.exec(content)) !== null) {
    const num = m[1]
    let source = m[2].trim()
    // Strip surrounding bold markers
    source = source.replace(/^\*{1,2}/, '').replace(/\*{1,2}$/, '')
    // Clean up markdown links
    const linkMatch = source.match(/\[([^\]]+)\]\([^)]*\)/)
    if (linkMatch) source = linkMatch[1]
    map.set(num, source)
  }
  return map
}

function CitationBadge({
  num,
  source,
  onSourceClick,
}: {
  num: string
  source: string
  onSourceClick: (source: string, page?: number) => void
}) {
  const [isOpen, setIsOpen] = React.useState(false)
  const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = React.useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => setIsOpen(true), 80)
  }, [])

  const handleMouseLeave = React.useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => setIsOpen(false), 160)
  }, [])

  React.useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    }
  }, [])

  // Parse source into filename and page reference
  const parts = source.match(/^(.+?)(?:,\s*p\.?\s*(.+))?$/)
  const filename = parts?.[1]?.trim() ?? source
  const pageRef = parts?.[2]?.trim()
  const pageNum = pageRef ? parseInt(pageRef, 10) : undefined

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => {
            e.preventDefault()
            onSourceClick(filename, pageNum)
          }}
          className="inline-flex items-center gap-0.5 px-1.5 py-0 text-[10px] font-medium bg-accent-blue/10 text-accent-blue rounded-full border border-accent-blue/20 hover:bg-accent-blue/20 transition-colors leading-tight cursor-pointer"
        >
          {num}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={6}
        className="w-64 p-0 overflow-hidden"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          role="button"
          className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => {
            setIsOpen(false)
            onSourceClick(filename, pageNum)
          }}
        >
          <span className="text-muted-foreground shrink-0 mt-0.5">
            <FileText className="size-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium line-clamp-2 leading-snug">
              {filename}
            </div>
            {pageRef && (
              <div className="text-xs text-muted-foreground mt-0.5">
                p. {pageRef}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function WikiImage({
  src,
  alt,
  documents,
  wikiActivePath,
}: {
  src?: string
  alt?: string
  documents?: DocumentListItem[]
  wikiActivePath?: string
}) {
  const token = useUserStore((s) => s.accessToken)
  const [svgContent, setSvgContent] = React.useState<string | null>(null)
  const [imageUrl, setImageUrl] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!src || !documents || !token) return
    // Only resolve relative paths (not http:// or data: URIs)
    if (src.startsWith('http') || src.startsWith('data:')) return

    // Resolve relative path: strip leading ./ and resolve against current wiki path
    let filename = src.replace(/^\.\//, '')
    const doc = documents.find((d) => {
      return d.filename === filename || d.filename === filename.split('/').pop()
    })

    if (!doc) return

    const isSvg = doc.file_type === 'svg'
    const isTextAsset = ['svg', 'csv', 'xml', 'html'].includes(doc.file_type)
    const isImageBinary = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(doc.file_type)

    setLoading(true)

    if (isSvg || isTextAsset) {
      // Text-based assets stored in the content column — fetch via API
      apiFetch<{ content: string }>(`/v1/documents/${doc.id}/content`, token)
        .then((res) => {
          if (isSvg && res.content) {
            setSvgContent(res.content)
          } else if (res.content) {
            // For non-SVG text assets, render as data URI
            const blob = new Blob([res.content], { type: `image/${doc.file_type}+xml` })
            setImageUrl(URL.createObjectURL(blob))
          }
        })
        .catch(() => { /* silent fail — image just won't render */ })
        .finally(() => setLoading(false))
    } else if (isImageBinary) {
      // Binary images stored in S3 — use the /url endpoint
      apiFetch<{ url: string }>(`/v1/documents/${doc.id}/url`, token)
        .then((res) => setImageUrl(res.url))
        .catch(() => { /* silent fail */ })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [src, documents, token, wikiActivePath])

  // Inline SVG rendering
  if (svgContent) {
    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`
    return (
      <ExpandableMedia content={svgContent} type="svg" alt={alt}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUri}
          alt={alt || ''}
          className="max-w-full h-auto my-5 mx-auto block"
        />
      </ExpandableMedia>
    )
  }

  // Resolved image URL (binary or data URI)
  if (imageUrl) {
    return (
      <ExpandableMedia content={imageUrl} type="img" alt={alt}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={alt || ''}
          className="max-w-full h-auto rounded-lg my-5 border border-border/30"
        />
      </ExpandableMedia>
    )
  }

  // Still loading — use span to avoid div-inside-p hydration error
  if (loading) {
    return (
      <span className="block my-5 flex justify-center">
        <span className="block w-48 h-32 rounded-lg bg-muted/60 animate-pulse" />
      </span>
    )
  }

  // Fallback: render as a normal image tag (external URLs, unresolved paths)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt || ''}
      className="max-w-full h-auto rounded-lg my-5 border border-border/30"
    />
  )
}

interface BacklinkNode {
  id: string
  title: string
  path: string
  source_kind: string
}

function BacklinksPanel({
  docId,
  kbId,
  onNavigate,
}: {
  docId: string
  kbId: string
  onNavigate: (path: string) => void
}) {
  const token = useUserStore((s) => s.accessToken)
  const [expanded, setExpanded] = React.useState(false)
  const [backlinks, setBacklinks] = React.useState<BacklinkNode[] | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!expanded || backlinks !== null || !token) return
    setLoading(true)
    apiFetch<{ nodes: BacklinkNode[]; edges: { source: string; target: string }[] }>(
      `/v1/knowledge-bases/${kbId}/graph`,
      token,
    )
      .then((data) => {
        const nodeMap = new Map(data.nodes.map((n) => [n.id, n]))
        const incoming = data.edges
          .filter((e) => e.target === docId)
          .map((e) => nodeMap.get(e.source))
          .filter((n): n is BacklinkNode => n !== undefined && n.source_kind === 'wiki')
        setBacklinks(incoming)
      })
      .catch(() => setBacklinks([]))
      .finally(() => setLoading(false))
  }, [expanded, docId, kbId, token, backlinks])

  // Reset when doc changes
  React.useEffect(() => {
    setBacklinks(null)
    setExpanded(false)
  }, [docId])

  return (
    <div className="mt-10 pt-6 border-t border-border/60">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer group"
      >
        <Link2 className="size-3.5" />
        <span>Linked from</span>
        <ChevronRight
          className={cn(
            'size-3 transition-transform duration-150',
            expanded && 'rotate-90',
          )}
        />
      </button>
      {expanded && (
        <div className="mt-2">
          {loading && (
            <p className="text-xs text-muted-foreground/40 pl-1">Loading...</p>
          )}
          {!loading && backlinks !== null && backlinks.length === 0 && (
            <p className="text-xs text-muted-foreground/40 pl-1">No pages link here yet.</p>
          )}
          {!loading && backlinks && backlinks.length > 0 && (
            <ul className="space-y-0.5">
              {backlinks.map((link) => {
                const wikiPath = link.path.replace(/^\/wiki\/?/, '')
                return (
                  <li key={link.id}>
                    <button
                      onClick={() => onNavigate(wikiPath)}
                      className="flex items-center gap-2 w-full text-left text-sm px-1 py-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      <FileText className="size-3.5 shrink-0 opacity-40" />
                      <span className="truncate">{link.title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

interface WikiContentProps {
  content: string
  title: string
  onNavigate: (path: string) => void
  onSourceClick?: (filename: string, page?: number) => void
  onGraphClick?: () => void
  documents?: DocumentListItem[]
  activeDocId?: string | null
  kbId?: string
}

export function WikiContent({ content, title, onNavigate, onSourceClick, onGraphClick, documents, activeDocId, kbId }: WikiContentProps) {
  const processedContent = React.useMemo(() => stripLeadingH1(content, title), [content, title])
  const tocItems = React.useMemo(() => extractTocFromMarkdown(processedContent), [processedContent])
  const footnoteSources = React.useMemo(() => parseFootnoteSources(processedContent), [processedContent])
  const [copied, setCopied] = React.useState(false)

  const handleCopy = React.useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [content])

  const handleDownload = React.useCallback(() => {
    const filename = title ? `${title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase()}.md` : 'page.md'
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, [content, title])

  const components: Components = React.useMemo(
    () => ({
      h1({ children }) {
        const text = childrenToText(children)
        const id = slugify(text)
        return (
          <h1 id={id} className="text-2xl font-bold tracking-tight mt-8 mb-3 first:mt-0 scroll-mt-20">
            {children}
          </h1>
        )
      },
      h2({ children }) {
        const text = childrenToText(children)
        const id = slugify(text)
        return (
          <h2 id={id} className="text-xl font-semibold tracking-tight mt-6 mb-2 pt-2 border-t border-border/50 first:border-0 first:pt-0 scroll-mt-20">
            {children}
          </h2>
        )
      },
      h3({ children }) {
        const text = childrenToText(children)
        const id = slugify(text)
        return (
          <h3 id={id} className="text-lg font-medium tracking-tight mt-6 mb-1.5 scroll-mt-20">
            {children}
          </h3>
        )
      },
      h4({ children }) {
        const text = childrenToText(children)
        const id = slugify(text)
        return (
          <h4 id={id} className="text-base font-medium mt-5 mb-1 scroll-mt-20">
            {children}
          </h4>
        )
      },
      p({ children }) {
        return <p className="my-2 leading-[1.65] text-foreground/90">{children}</p>
      },
      pre({ children, ...props }) {
        const child = React.Children.toArray(children)[0]
        if (
          React.isValidElement(child) &&
          typeof child.props === 'object' &&
          child.props !== null &&
          'className' in child.props &&
          typeof child.props.className === 'string' &&
          child.props.className.includes('language-mermaid')
        ) {
          const text =
            'children' in child.props
              ? String(child.props.children).replace(/\n$/, '')
              : ''
          return <MermaidBlock chart={text} />
        }
        return (
          <pre
            className="text-[13px] leading-relaxed my-3 bg-muted/60 border border-border rounded-lg p-4 overflow-x-auto"
            {...props}
          >
            {children}
          </pre>
        )
      },
      code({ className, children, ...props }) {
        const isBlock = className?.startsWith('language-')
        if (isBlock) {
          return (
            <code className={className} {...props}>
              {children}
            </code>
          )
        }
        return (
          <code
            className="text-[13px] bg-muted/70 px-1.5 py-0.5 rounded font-mono text-foreground/80"
            {...props}
          >
            {children}
          </code>
        )
      },
      a({ href, children }) {
        // Footnote back-references (↩ arrows) — hide entirely
        if (href?.includes('fnref')) {
          return null
        }
        const text = childrenToText(children)
        if (text.includes('↩') || text.includes('↵')) {
          return null
        }
        if (href?.startsWith('#fn-') || href?.startsWith('#user-content-fn-')) {
          return (
            <a
              href={href}
              className="text-muted-foreground/50 hover:text-muted-foreground no-underline ml-1"
            >
              {children}
            </a>
          )
        }

        // Internal wiki links
        if (
          href &&
          !href.startsWith('http') &&
          !href.startsWith('#') &&
          !href.startsWith('mailto:')
        ) {
          return (
            <button
              onClick={() => onNavigate(href)}
              className="text-accent-blue underline underline-offset-2 decoration-accent-blue/30 hover:decoration-accent-blue transition-colors cursor-pointer font-medium"
            >
              {children}
            </button>
          )
        }

        // Anchor links (headings)
        if (href?.startsWith('#')) {
          return (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                const id = href.slice(1)
                const el = document.getElementById(id)
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="text-accent-blue underline underline-offset-2 decoration-accent-blue/30 hover:decoration-accent-blue transition-colors"
            >
              {children}
            </a>
          )
        }

        return (
          <a
            href={href ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-blue underline underline-offset-2 decoration-accent-blue/30 hover:decoration-accent-blue transition-colors"
          >
            {children}
          </a>
        )
      },
      sup({ children, ...props }) {
        // Detect footnote references like [^1] which render as <sup> with an <a> inside
        const child = React.Children.toArray(children)[0]
        const childProps = React.isValidElement(child) ? (child.props as Record<string, unknown>) : null
        const childHref = childProps && typeof childProps.href === 'string' ? childProps.href : null
        if (childHref && childHref.includes('fn')) {
          const text = childrenToText(children)
          const num = text.replace(/[^\d]/g, '')
          const source = footnoteSources.get(num)
          if (source) {
            return (
              <sup {...props}>
                <CitationBadge
                  num={num}
                  source={source}
                  onSourceClick={(filename, page) => {
                    if (onSourceClick) onSourceClick(filename, page)
                  }}
                />
              </sup>
            )
          }
        }
        return <sup {...props}>{children}</sup>
      },
      table({ children, ...props }) {
        return (
          <div className="overflow-x-auto my-6 rounded-lg border border-border">
            <table className="w-full border-collapse text-sm" {...props}>
              {children}
            </table>
          </div>
        )
      },
      thead({ children, ...props }) {
        return (
          <thead className="bg-muted/50" {...props}>
            {children}
          </thead>
        )
      },
      th({ children, ...props }) {
        return (
          <th
            className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground px-3 py-2 border-b border-border"
            {...props}
          >
            {children}
          </th>
        )
      },
      td({ children, ...props }) {
        return (
          <td className="text-sm px-3 py-2 border-b border-border/50" {...props}>
            {children}
          </td>
        )
      },
      blockquote({ children, ...props }) {
        return (
          <blockquote
            className="border-l-[3px] border-accent-blue/40 pl-4 my-3 py-1 text-muted-foreground bg-accent-blue/[0.03] rounded-r-md"
            {...props}
          >
            {children}
          </blockquote>
        )
      },
      ul({ children, ...props }) {
        return (
          <ul className="my-2.5 space-y-0.5 list-disc pl-5 marker:text-muted-foreground/40" {...props}>
            {children}
          </ul>
        )
      },
      ol({ children, ...props }) {
        return (
          <ol className="my-2.5 space-y-0.5 list-decimal pl-5 marker:text-muted-foreground/40" {...props}>
            {children}
          </ol>
        )
      },
      li({ children, ...props }) {
        // Style footnote list items (inside <section data-footnotes>)
        const id = (props as Record<string, unknown>).id
        if (typeof id === 'string' && (id.startsWith('fn-') || id.startsWith('user-content-fn-'))) {
          const text = childrenToText(children).replace(/↩.*$/, '').trim()
          return (
            <li
              id={id}
              className="my-2 text-sm pl-1 scroll-mt-20"
            >
              <button
                onClick={() => onSourceClick?.(text)}
                className="text-muted-foreground hover:text-foreground hover:underline transition-colors cursor-pointer text-left"
              >
                {text}
              </button>
            </li>
          )
        }
        return (
          <li className="my-0.5 leading-[1.65]" {...props}>
            {children}
          </li>
        )
      },
      hr() {
        return <hr className="my-6 border-border/60" />
      },
      img({ src, alt }) {
        return (
          <WikiImage
            src={typeof src === 'string' ? src : undefined}
            alt={typeof alt === 'string' ? alt : undefined}
            documents={documents}
          />
        )
      },
      section({ children, ...props }) {
        // Replace the auto-generated footnotes section with our own clean version
        const dp = props as Record<string, unknown>
        if (dp['data-footnotes'] !== undefined || dp.dataFootnotes !== undefined || dp.className === 'footnotes') {
          // Render our own clean footnotes from parsed sources
          const entries = Array.from(footnoteSources.entries())
          if (entries.length === 0) return null
          return (
            <section className="mt-12 pt-6 border-t border-border">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-3">
                Sources
              </p>
              <ol className="list-decimal pl-5 space-y-1.5">
                {entries.map(([num, source]) => {
                  const filename = source.replace(/,\s*p\.?\s*.+$/, '').trim()
                  return (
                    <li key={num} className="text-sm pl-1">
                      <button
                        onClick={() => onSourceClick?.(filename)}
                        className="text-muted-foreground hover:text-foreground hover:underline transition-colors cursor-pointer text-left"
                      >
                        {source}
                      </button>
                    </li>
                  )
                })}
              </ol>
            </section>
          )
        }
        return <section {...props}>{children}</section>
      },
    }),
    [onNavigate, onSourceClick, footnoteSources, documents],
  )

  const hasToc = tocItems.length > 0

  return (
    <div className="h-full overflow-y-auto" id="wiki-scroll-container">
      <div className={cn(
        'mx-auto px-6 py-10',
        hasToc ? 'max-w-5xl' : 'max-w-3xl',
      )}>
        <div className={cn(
          hasToc && 'flex gap-8',
        )}>
          {/* Main content */}
          <div className={cn(
            'min-w-0',
            hasToc ? 'flex-1 max-w-[720px]' : 'w-full',
          )}>
            {title && (
              <div className="flex items-start justify-between gap-4 mb-2">
                <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
                <div className="flex items-center gap-1 shrink-0 mt-1.5">
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
                    title="Copy markdown"
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  </button>
                  {/* <button
                    onClick={handleDownload}
                    className="p-1.5 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
                    title="Download as .md"
                  >
                    <Download className="size-3.5" />
                  </button> */}
                  {onGraphClick && (
                    <button
                      onClick={onGraphClick}
                      className="p-1.5 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
                      title="Show in graph"
                    >
                      <Network className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="wiki-content text-[15px] leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={components}
              >
                {processedContent}
              </ReactMarkdown>
            </div>

            {activeDocId && kbId && (
              <BacklinksPanel
                docId={activeDocId}
                kbId={kbId}
                onNavigate={onNavigate}
              />
            )}
          </div>

          {/* Right sidebar — "On this page" ToC */}
          {hasToc && (
            <aside className="hidden lg:block w-48 shrink-0">
              <div className="sticky top-10">
                <TableOfContents items={tocItems} />
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}

function childrenToText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(childrenToText).join('')
  if (React.isValidElement(children) && children.props) {
    const props = children.props as Record<string, unknown>
    if (props.children) return childrenToText(props.children as React.ReactNode)
  }
  return ''
}
