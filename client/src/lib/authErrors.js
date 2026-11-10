// Map Supabase error codes/messages to friendly bilingual keys.
// Unknown errors fall back to the generic key so the user is never
// left with a raw technical message.
export function authErrorKey(error) {
  if (!error) return null
  const msg = String(error.message || '')
  if (/invalid login credentials/i.test(msg)) return 'badCredentials'
  if (/email not confirmed/i.test(msg)) return 'emailNotConfirmed'
  if (/user already registered|already been registered/i.test(msg)) return 'emailTaken'
  if (/password should be at least/i.test(msg)) return 'weakPassword'
  if (/rate limit|too many requests/i.test(msg)) return 'rateLimit'
  if (/same password/i.test(msg)) return 'samePassword'
  if (/password reset/i.test(msg)) return 'resetFailed'
  if (/failed to fetch|networkerror/i.test(msg)) return 'network'
  return 'generic'
}
