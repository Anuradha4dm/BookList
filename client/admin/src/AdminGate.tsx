import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { Skeleton } from '@booklist/ui'
import { AdminAuthContext } from './auth'
import { LoginForm } from './LoginForm'

type GateStatus = 'checking' | 'out' | 'in'

export function AdminGate() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<GateStatus>('checking')
  const [email, setEmail] = useState('')
  const [logoutError, setLogoutError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/session', { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setStatus('out')
          return
        }
        const body = (await response.json()) as { role?: string; email?: string }
        if (body.role !== 'admin') {
          setStatus('out')
          return
        }
        setEmail(body.email ?? '')
        setStatus('in')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('out')
      })
    return () => controller.abort()
  }, [])

  async function signOut() {
    try {
      const response = await fetch('/api/session', { method: 'DELETE', credentials: 'include' })
      if (response.ok || response.status === 401) {
        setLogoutError('')
        setEmail('')
        setStatus('out')
        navigate('/', { replace: true })
        return
      }
      setLogoutError('Could not log out. Try again.')
    } catch {
      setLogoutError('Could not log out. Try again.')
    }
  }

  if (status === 'checking') {
    return (
      <div className="admin-login">
        <Skeleton />
      </div>
    )
  }

  if (status === 'out') {
    return (
      <LoginForm
        onSuccess={(nextEmail) => {
          setLogoutError('')
          setEmail(nextEmail)
          setStatus('in')
          navigate('/', { replace: true })
        }}
      />
    )
  }

  return (
    <AdminAuthContext.Provider value={{ email, signOut, logoutError }}>
      <Outlet />
    </AdminAuthContext.Provider>
  )
}
