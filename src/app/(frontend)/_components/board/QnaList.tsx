import Link from 'next/link'
import React from 'react'

import type { Post } from '@/payload-types'
import { askQuestionAction } from '../../board/[bbsId]/askActions'

/**
 * Q&A board (ref 2-8). Lists questions with an answered/pending indicator, each
 * linking to the detail (question + admin answer). A logged-in MEMBER sees an
 * "ask a question" form when the board has `userPostAllowed` — posting goes
 * through {@link askQuestionAction}, which server-forces board/site/author and
 * blocks isNotice/isSecret/answer forgery. Anonymous visitors are prompted to
 * sign in.
 */
export function QnaList({
  bbsId,
  posts,
  canAsk,
  isMember,
  askError,
  asked,
}: {
  bbsId: string
  posts: Post[]
  /** The board accepts member questions (userPostAllowed). */
  canAsk: boolean
  /** There is a logged-in member session. */
  isMember: boolean
  askError?: string
  asked?: boolean
}) {
  return (
    <div className="qna">
      {asked && (
        <p className="qna__notice" role="status">
          Your question has been posted.
        </p>
      )}

      {posts.length === 0 ? (
        <p className="page__empty">No questions yet.</p>
      ) : (
        <ul className="qna__list" role="list">
          {posts.map((post) => (
            <li key={post.id} className="qna__item">
              <Link className="qna__link" href={`/board/${bbsId}/${post.id}`}>
                <span className="qna__title">{post.title}</span>
                <span
                  className={`qna__status ${post.isAnswered ? 'qna__status--answered' : 'qna__status--pending'}`}
                >
                  {post.isAnswered ? 'Answered' : 'Pending'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canAsk && (
        <section className="qna__ask" aria-label="Ask a question">
          <h2 className="qna__ask-title">Ask a question</h2>
          {askError && (
            <p className="auth__error" role="alert">
              {askError}
            </p>
          )}
          {isMember ? (
            <form className="qna__ask-form" action={askQuestionAction}>
              <input type="hidden" name="bbsId" value={bbsId} />
              <div className="field">
                <label className="field__label" htmlFor="ask-title">
                  Title
                </label>
                <input className="field__input" id="ask-title" name="title" type="text" required />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="ask-content">
                  Question
                </label>
                <textarea className="field__input" id="ask-content" name="content" rows={5} />
              </div>
              <button className="auth__submit" type="submit">
                Submit question
              </button>
            </form>
          ) : (
            <p className="qna__ask-signin">
              Please{' '}
              <Link href={`/login?next=${encodeURIComponent(`/board/${bbsId}`)}`}>sign in</Link> to
              ask a question.
            </p>
          )}
        </section>
      )}
    </div>
  )
}
