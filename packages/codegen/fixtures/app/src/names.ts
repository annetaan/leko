/** A name kept in a constant, which is how a team that dislikes loose strings writes it. */
export const REPORT_EXPORTED = 'report-exported'

/** Narrowed to two names rather than one. Both of them count. */
export const EITHER = Date.now() % 2 === 0 ? 'invoice-mailed' : 'invoice-printed'
