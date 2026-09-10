import { createContext, useContext } from 'react'

export type AdminAuth = {
  email: string
  signOut: () => Promise<void>
  logoutError: string
}

export const AdminAuthContext = createContext<AdminAuth | null>(null)

export function useAdminAuth(): AdminAuth {
  const value = useContext(AdminAuthContext)
  if (!value) {
    throw new Error('Admin auth is missing')
  }
  return value
}
