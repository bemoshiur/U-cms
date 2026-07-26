import React from 'react'

import type { BoardCategoryOptions } from '@/site/board'

/** The current search selection (from the URL query), used to preserve inputs. */
export type SearchValues = {
  keyword?: string
  field?: string
  periodFrom?: string
  periodTo?: string
  category1?: string
  category2?: string
  category3?: string
}

/**
 * Multi-criteria board search form (ref 2-7). A no-JS GET `<form>` that submits
 * to the board's own URL, so the query string drives `buildPostSearchWhere` on
 * the server (the D6-hardened, injection-safe mapping). Renders keyword + field
 * scope + registration period, plus a select per configured category slot.
 */
export function SearchForm({
  basePath,
  fieldOptions,
  categories,
  values,
}: {
  basePath: string
  fieldOptions: { key: string; label: string }[]
  categories: BoardCategoryOptions[]
  values: SearchValues
}) {
  return (
    <form className="board-search" action={basePath} method="get" role="search">
      {categories.map((cat) => {
        const name = `category${cat.slot}`
        const current = values[name as keyof SearchValues] ?? ''
        return (
          <div className="board-search__field" key={cat.slot}>
            <label className="board-search__label" htmlFor={name}>
              {cat.title}
            </label>
            <select className="board-search__select" id={name} name={name} defaultValue={current}>
              <option value="">All</option>
              {cat.options.map((opt) => (
                <option key={String(opt.id)} value={String(opt.id)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )
      })}

      <div className="board-search__field">
        <label className="board-search__label" htmlFor="periodFrom">
          From
        </label>
        <input
          className="board-search__input"
          id="periodFrom"
          name="periodFrom"
          type="date"
          defaultValue={values.periodFrom ?? ''}
        />
      </div>
      <div className="board-search__field">
        <label className="board-search__label" htmlFor="periodTo">
          To
        </label>
        <input
          className="board-search__input"
          id="periodTo"
          name="periodTo"
          type="date"
          defaultValue={values.periodTo ?? ''}
        />
      </div>

      {fieldOptions.length > 0 && (
        <div className="board-search__field">
          <label className="board-search__label" htmlFor="field">
            In
          </label>
          <select
            className="board-search__select"
            id="field"
            name="field"
            defaultValue={values.field ?? ''}
          >
            <option value="">All fields</option>
            {fieldOptions.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="board-search__field board-search__field--keyword">
        <label className="board-search__label" htmlFor="keyword">
          Keyword
        </label>
        <input
          className="board-search__input"
          id="keyword"
          name="keyword"
          type="search"
          defaultValue={values.keyword ?? ''}
        />
      </div>

      <button className="board-search__submit" type="submit">
        Search
      </button>
    </form>
  )
}
