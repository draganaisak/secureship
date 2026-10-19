// Maps a failed admin request (mutator throws an object carrying `status`) to a
// human message. Shared by list-load, save, and delete so the wording stays
// consistent and lives in one place.
type ErrorKind = 'load' | 'save' | 'delete'

const FALLBACK: Record<ErrorKind, string> = {
  load: 'Something went wrong loading data. Please try again.',
  save: "Couldn't save your changes. Please try again.",
  delete: "Couldn't delete this record. Please try again.",
}

export function describeAdminError(error: unknown, kind: ErrorKind): string {
  const status =
    error && typeof error === 'object' && 'status' in error
      ? (error as { status?: number }).status
      : undefined
  switch (status) {
    case 401:
      return 'Your session has expired. Please sign in again.'
    case 403:
      return 'Your account is not authorized for admin access. Ask the owner to add your Auth0 user id to AUTH0_ADMIN_SUBS.'
    case 404:
      return 'That record no longer exists. Refresh and try again.'
    case 400:
      return 'That references something that no longer exists, or violates a constraint.'
    case 422:
      return 'Some fields are invalid. Please check your input and try again.'
    default:
      return FALLBACK[kind]
  }
}
