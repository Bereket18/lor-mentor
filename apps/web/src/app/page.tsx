import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export default async function RootPage() {
  const cookieStore = await cookies()
  const hasSession = cookieStore.has('access_token') || cookieStore.has('refresh_token')
  redirect(hasSession ? '/dashboard' : '/login')
}