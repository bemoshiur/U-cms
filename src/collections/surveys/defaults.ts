/**
 * Shared constants for the survey collections (Task 4D; refs 2-9..2-12).
 *
 * ## Questions-as-a-collection decision (documented)
 *
 * `surveyQuestions` and `surveyResponses` are SEPARATE tenant-scoped collections
 * rather than arrays embedded on `surveys`. An embedded questions array would be
 * simpler to author, but the survey system needs to (a) aggregate answers by
 * question across thousands of responses, (b) reference a stable question id from
 * every response's `answers[]`, and (c) freeze questions independently once the
 * survey starts. A relational model makes the aggregation query, the
 * answer→question join, and the immutability guard all first-class; embedding
 * would force whole-survey rewrites on every response and lose the stable
 * per-question id. Responses are obviously their own collection (unbounded,
 * per-participant). All three share ONE menu gate, `content.surveys`.
 */

/** The single menu key gating surveys + surveyQuestions + surveyResponses. */
export const SURVEYS_MENU_KEY = 'content.surveys'
