'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { MenuOverlayGroup } from './menuOverlayTree'

/**
 * Client half of "View all menus" (ref 3-11). Receives the ALREADY-FILTERED
 * `groups` from `ViewAllMenusNavLink` (server) as plain, serializable props —
 * this component does no data fetching and no access-control decisions of its
 * own; it only renders what it was handed. Reuses the full-screen
 * portal/backdrop/dialog shape established by `MemberExportButton` (dark
 * backdrop, centered white surface, `role="dialog"`/`aria-modal`), extended
 * here with a left rail (the top-level systems) + right panel (the selected
 * system's menu tree), and the accessibility behavior the brief calls out
 * explicitly: focus moves into the dialog on open, returns to the trigger
 * button on close, dismissible via an X button, Escape, or a backdrop click —
 * deliberately NOT a focus trap, so Tab can still leave the dialog normally.
 */

type Props = {
  groups: MenuOverlayGroup[]
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.5)',
  padding: '2rem',
}

const dialogStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 960,
  height: '100%',
  maxHeight: 640,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--theme-elevation-0, #fff)',
  color: 'var(--theme-elevation-800, #2a2d33)',
  borderRadius: 6,
  boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '1rem 1.25rem',
  borderBottom: '2px solid #0b50d0',
  background: 'var(--theme-elevation-50, #f4f5f6)',
  flex: '0 0 auto',
}

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  flex: '1 1 auto',
  minHeight: 0,
}

const railStyle: React.CSSProperties = {
  flex: '0 0 220px',
  borderRight: '1px solid var(--theme-elevation-150, #dde1e6)',
  background: 'var(--theme-elevation-50, #f4f5f6)',
  overflowY: 'auto',
  padding: '0.5rem',
}

const panelStyle: React.CSSProperties = {
  flex: '1 1 auto',
  overflowY: 'auto',
  padding: '1rem 1.5rem',
}

function railButtonStyle(active: boolean): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '0.65rem 0.75rem',
    marginBottom: 2,
    borderRadius: 3,
    border: 'none',
    background: active ? '#0b50d0' : 'transparent',
    color: active ? '#ffffff' : 'var(--theme-elevation-800, #2a2d33)',
    fontWeight: active ? 600 : 500,
    fontSize: '0.9rem',
    cursor: 'pointer',
  }
}

export function ViewAllMenusOverlay({ groups }: Props): React.ReactElement | null {
  const [open, setOpen] = useState(false)
  const [activeNamespace, setActiveNamespace] = useState<string | undefined>(groups[0]?.namespace)

  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  const activeGroup = groups.find((g) => g.namespace === activeNamespace) ?? groups[0]

  const openOverlay = (): void => {
    setActiveNamespace((current) => current ?? groups[0]?.namespace)
    setOpen(true)
  }

  const closeOverlay = (): void => {
    setOpen(false)
  }

  // Focus moves into the dialog on open; returns to the trigger button on
  // close (WCAG 2.4.3-conscious — matches the brief's explicit accessibility
  // bar). Deliberately no focus TRAP: Tab is free to leave the dialog.
  useEffect(() => {
    if (open) {
      dialogRef.current?.focus()
    } else {
      triggerRef.current?.focus()
    }
  }, [open])

  // Escape dismisses, from anywhere in the dialog.
  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        closeOverlay()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (groups.length === 0) {
    return null
  }

  const modal =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div style={overlayStyle} onClick={closeOverlay} data-testid="view-all-menus-backdrop">
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="view-all-menus-title"
              tabIndex={-1}
              style={dialogStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={headerStyle}>
                <h2 id="view-all-menus-title" style={{ margin: 0, fontSize: '1.05rem' }}>
                  View All Menus (전체 메뉴 보기)
                </h2>
                <button
                  type="button"
                  onClick={closeOverlay}
                  aria-label="Close"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    fontSize: '1.4rem',
                    lineHeight: 1,
                    cursor: 'pointer',
                    color: 'var(--theme-elevation-600, #50565d)',
                    padding: '0.25rem 0.5rem',
                  }}
                >
                  ×
                </button>
              </div>

              <div style={bodyStyle}>
                <nav aria-label="Systems" style={railStyle}>
                  {groups.map((g) => (
                    <button
                      key={g.namespace}
                      type="button"
                      onClick={() => setActiveNamespace(g.namespace)}
                      aria-current={g.namespace === activeGroup?.namespace ? 'true' : undefined}
                      style={railButtonStyle(g.namespace === activeGroup?.namespace)}
                    >
                      {g.label}
                    </button>
                  ))}
                </nav>

                <div style={panelStyle}>
                  {activeGroup ? (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {activeGroup.items.map((item) => (
                        <li
                          key={item.id}
                          style={{
                            paddingLeft: `${item.depth * 1.25}rem`,
                            marginBottom: '0.4rem',
                          }}
                        >
                          {item.href ? (
                            // A full-navigation anchor (not next/link): these are
                            // Payload admin routes served by Payload's catch-all —
                            // same reasoning as PrivacyNavLink/StatisticsNavLink.
                            <a
                              href={item.href}
                              style={{
                                display: 'inline-block',
                                padding: '0.35rem 0.5rem',
                                borderRadius: 3,
                                color: '#0b50d0',
                                textDecoration: 'none',
                                fontSize: '0.9rem',
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.background =
                                  'var(--theme-elevation-50, #f4f5f6)'
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.background = 'transparent'
                              }}
                            >
                              {item.name}
                            </a>
                          ) : (
                            // No resolvable admin route (a pure grouping node with no
                            // bound collection and no dedicated view) — a plain,
                            // non-clickable label rather than a dead link.
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.35rem 0.5rem',
                                color: 'var(--theme-elevation-600, #50565d)',
                                fontSize: '0.9rem',
                                fontWeight: 600,
                              }}
                            >
                              {item.name}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openOverlay}
        className="nav__link"
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          padding: '.5rem .75rem',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          font: 'inherit',
          color: 'inherit',
        }}
      >
        View All Menus (전체 메뉴 보기)
      </button>
      {modal}
    </>
  )
}

export default ViewAllMenusOverlay
