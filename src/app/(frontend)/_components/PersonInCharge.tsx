import React from 'react'

/** Resolved data-manager (담당자) display info (ref 2-3). */
export type PersonInChargeInfo = {
  name: string
  department: string | null
  contact: string | null
}

/**
 * Person-in-charge / data-manager block (ref 2-3), rendered under a web-content
 * page ONLY when the site's `dataManagerEnabled` toggle is on (the gate lives in
 * the page route). Shows the name and, when present, the department and contact.
 */
export function PersonInCharge({ person }: { person: PersonInChargeInfo }) {
  if (!person.name && !person.department && !person.contact) {
    return null
  }
  return (
    <aside className="data-manager" aria-label="Data manager">
      <h2 className="data-manager__title">Data manager</h2>
      <dl className="data-manager__list">
        {person.name && (
          <div className="data-manager__row">
            <dt className="data-manager__key">Name</dt>
            <dd className="data-manager__value">{person.name}</dd>
          </div>
        )}
        {person.department && (
          <div className="data-manager__row">
            <dt className="data-manager__key">Department</dt>
            <dd className="data-manager__value">{person.department}</dd>
          </div>
        )}
        {person.contact && (
          <div className="data-manager__row">
            <dt className="data-manager__key">Contact</dt>
            <dd className="data-manager__value">{person.contact}</dd>
          </div>
        )}
      </dl>
    </aside>
  )
}
