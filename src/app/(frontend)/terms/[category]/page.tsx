import { notFound } from 'next/navigation'
import React from 'react'

import { TERMS_CATEGORIES, isTermsCategory, termsCategoryDef } from '@/content/terms'
import { loadActiveTerms, loadTermsHistory } from '@/site/terms'
import { getActiveSite, getPayloadClient } from '@/site/rsc'
import { RichTextContent } from '../../_components/RichTextContent'

/** Formats an ISO date to `YYYY-MM-DD`, or `—` when absent. */
function fmtDate(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10)
}

/**
 * Public privacy/terms page (`/terms/[category]`, Task 4E — refs 2-15, 2-16).
 * Renders the ACTIVE (published) version's body via the SAFE Lexical serializer,
 * a category tab bar (the five fixed legacy categories), and a PUBLISHED change
 * history (ref 2-16 — the consent-transparency change log). Draft/unpublished
 * versions never surface here. An unknown category param 404s; a valid category
 * with no published terms shows a not-published notice (the tabs stay usable).
 */
export default async function TermsPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params
  if (!isTermsCategory(category)) {
    notFound()
  }
  const site = await getActiveSite()
  if (!site) {
    notFound()
  }

  const payload = await getPayloadClient()
  const active = await loadActiveTerms(payload, site.id, category)
  const history = active ? await loadTermsHistory(payload, active.id) : []
  const def = termsCategoryDef(category)!

  return (
    <div className="page page--terms">
      <p className="page__eyebrow">Privacy &amp; Terms</p>
      <h1 className="page__title">{active?.title || def.label}</h1>

      <nav className="terms-tabs" aria-label="Terms categories">
        <ul className="terms-tabs__list" role="list">
          {TERMS_CATEGORIES.map((c) => (
            <li key={c.value} className="terms-tabs__item">
              <a
                href={`/terms/${c.value}`}
                className={
                  c.value === category
                    ? 'terms-tabs__link terms-tabs__link--active'
                    : 'terms-tabs__link'
                }
                aria-current={c.value === category ? 'page' : undefined}
              >
                {c.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {active ? (
        <>
          {active.effectiveDate ? (
            <p className="page__meta">Effective date: {fmtDate(active.effectiveDate)}</p>
          ) : null}
          <RichTextContent className="rich-text terms-body" data={active.content} />

          {history.length > 0 ? (
            <section className="terms-history" aria-label="Version history">
              <h2 className="terms-history__title">Change history</h2>
              <table className="terms-history__table">
                <thead>
                  <tr>
                    <th scope="col">Version</th>
                    <th scope="col">Title</th>
                    <th scope="col">Effective date</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={String(h.versionId)}>
                      <td>Ver. {history.length - i}</td>
                      <td>{h.title || def.label}</td>
                      <td>{fmtDate(h.effectiveDate ?? h.updatedAt)}</td>
                      <td>{h.current ? 'In use' : 'Superseded'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      ) : (
        <p className="page__empty">These terms have not been published yet.</p>
      )}
    </div>
  )
}
