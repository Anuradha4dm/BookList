export type Env = {
  PORT: number
  DATABASE_PATH: string
  SESSION_SECRET: string
  ADMIN_EMAIL: string
  ADMIN_PASSWORD: string
}

const REQUIRED = [
  'PORT',
  'DATABASE_PATH',
  'SESSION_SECRET',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
] as const

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const missing = REQUIRED.filter((name) => {
    const value = source[name]
    return value === undefined || value.trim() === ''
  })

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`)
    process.exit(1)
  }

  return {
    PORT: Number(source.PORT),
    DATABASE_PATH: source.DATABASE_PATH as string,
    SESSION_SECRET: source.SESSION_SECRET as string,
    ADMIN_EMAIL: source.ADMIN_EMAIL as string,
    ADMIN_PASSWORD: source.ADMIN_PASSWORD as string,
  }
}
