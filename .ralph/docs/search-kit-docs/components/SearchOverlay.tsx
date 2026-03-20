'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

interface SearchResult {
  type: 'article' | 'event' | 'business'
  title: string
  excerpt: string
  slug: string
  url: string
  category?: string
  date?: string
}

const typeLabels: Record<string, string> = {
  article: 'Article',
  event: 'Event',
  business: 'Business',
}

const typeColors: Record<string, string> = {
  article: 'bg-crimson',
  event: 'bg-emerald-600',
  business: 'bg-gold text-midnight',
}

export function SearchOverlay({ locale }: { locale: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>(null)

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setResults([])
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [close])

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  // Expose open function for the search button
  useEffect(() => {
    function handleSearchClick(e: Event) {
      e.preventDefault()
      setIsOpen(true)
    }
    const btns = document.querySelectorAll('.search-btn')
    btns.forEach((btn) => btn.addEventListener('click', handleSearchClick))
    return () => btns.forEach((btn) => btn.removeEventListener('click', handleSearchClick))
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&locale=${locale}`)
        const data = await res.json()
        setResults(data.results || [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [query, locale])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-[var(--bg-primary)] border border-[var(--border-color)] shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--border-color)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)] shrink-0">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles, events, businesses..."
            className="flex-1 bg-transparent text-lg font-body text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center px-2 py-1 text-xs font-nav text-[var(--text-muted)] border border-[var(--border-color)] rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {loading && (
            <div className="px-6 py-8 text-center">
              <div className="inline-block w-5 h-5 border-2 border-[var(--text-muted)] border-t-crimson rounded-full animate-spin" />
            </div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="px-6 py-8 text-center">
              <p className="font-body text-[var(--text-muted)]">No results found for &ldquo;{query}&rdquo;</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <ul>
              {results.map((result, i) => (
                <li key={`${result.type}-${result.slug}-${i}`}>
                  <Link
                    href={result.url}
                    onClick={close}
                    className="flex items-start gap-4 px-6 py-4 hover:bg-[var(--bg-secondary)] transition-colors border-b border-[var(--border-color)] last:border-b-0"
                  >
                    <span className={`shrink-0 mt-0.5 px-2 py-0.5 text-[10px] font-nav uppercase tracking-wider text-white rounded-sm ${typeColors[result.type]}`}>
                      {typeLabels[result.type]}
                    </span>
                    <div className="min-w-0">
                      <p className="font-display text-base font-semibold text-[var(--text-primary)] truncate">
                        {result.title}
                      </p>
                      {result.excerpt && (
                        <p className="font-body text-sm text-[var(--text-muted)] line-clamp-1 mt-0.5">
                          {result.excerpt}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {!loading && query.length < 2 && (
            <div className="px-6 py-8 text-center">
              <p className="font-body text-sm text-[var(--text-muted)]">
                Type at least 2 characters to search
              </p>
              <p className="font-nav text-xs text-[var(--text-muted)] mt-2">
                <kbd className="px-1.5 py-0.5 border border-[var(--border-color)] rounded text-[10px]">Ctrl</kbd>
                {' + '}
                <kbd className="px-1.5 py-0.5 border border-[var(--border-color)] rounded text-[10px]">K</kbd>
                {' to toggle search'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
