import { NextRequest, NextResponse } from 'next/server'
import { getPayloadClient } from '@/lib/payload'
import type { Locale } from '@/i18n/config'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get('q')?.trim()
  const locale = (searchParams.get('locale') || 'en') as Locale

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  try {
    const payload = await getPayloadClient()

    // Search articles, events, and businesses in parallel
    const [articles, events, businesses] = await Promise.all([
      payload.find({
        collection: 'articles',
        where: {
          and: [
            { status: { equals: 'published' } },
            {
              or: [
                { title: { contains: q } },
                { excerpt: { contains: q } },
              ],
            },
          ],
        },
        sort: '-publishedDate',
        limit: 5,
        locale,
        depth: 1,
      }).catch(() => ({ docs: [] })),

      payload.find({
        collection: 'events' as any,
        where: {
          and: [
            { status: { equals: 'published' } },
            {
              or: [
                { title: { contains: q } },
                { description: { contains: q } },
              ],
            },
          ],
        },
        sort: '-eventDate',
        limit: 5,
        locale,
        depth: 1,
      }).catch(() => ({ docs: [] })),

      payload.find({
        collection: 'businesses' as any,
        where: {
          or: [
            { name: { contains: q } },
            { description: { contains: q } },
          ],
        },
        limit: 5,
        locale,
        depth: 1,
      }).catch(() => ({ docs: [] })),
    ])

    const results = [
      ...articles.docs.map((a: any) => ({
        type: 'article' as const,
        title: a.title,
        excerpt: a.excerpt || '',
        slug: a.slug,
        url: `/${locale}/blog/${a.slug}`,
        category: typeof a.category === 'object' ? a.category?.name : null,
      })),
      ...events.docs.map((e: any) => ({
        type: 'event' as const,
        title: e.title,
        excerpt: e.description?.substring(0, 150) || '',
        slug: e.slug,
        url: `/${locale}/events/${e.slug}`,
        date: e.eventDate,
      })),
      ...businesses.docs.map((b: any) => ({
        type: 'business' as const,
        title: b.name,
        excerpt: b.description?.substring(0, 150) || '',
        slug: b.slug,
        url: `/${locale}/directory/${typeof b.category === 'object' ? b.category?.slug : 'all'}/${b.slug}`,
      })),
    ]

    return NextResponse.json(
      { results },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    )
  } catch {
    return NextResponse.json({ results: [] }, { status: 500 })
  }
}
