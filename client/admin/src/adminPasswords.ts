export function settingsPasswordBody(password: string): { password: string } {
  return { password }
}

export function parentsFindQuery(email: string): string {
  return `email=${encodeURIComponent(email)}`
}

export function parentsPasswordBody(
  email: string,
  password: string,
): { email: string; password: string } {
  return { email, password }
}
