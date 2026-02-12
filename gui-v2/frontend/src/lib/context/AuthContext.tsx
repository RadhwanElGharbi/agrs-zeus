'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { API_BASE_URL } from '@/lib/api-client'

export interface User {
  // Primary identity fields (always expected)
  username: string
  name?: string | null
  role?: string | null
  company?: string | null

  // Extended profile fields (may be present depending on backend payload)
  id?: string
  email?: string | null
  full_name?: string | null
  organization?: string | null
  position?: string | null
  department?: string | null
  station?: string | null
  work_phone?: string | null
  serial_number?: string | null
  access_level?: string | null
  is_active?: boolean
  profile_image_url?: string | null
  created_at?: string | null
  updated_at?: string | null
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Check for existing session on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('agrs_token')
    if (storedToken) {
      verifyToken(storedToken)
    } else {
      setIsLoading(false)
    }
  }, [])

  const verifyToken = async (tokenToVerify: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${tokenToVerify}`
        }
      })
      const data = await response.json()

      if (data.authenticated && data.user) {
        setUser(data.user)
        setToken(tokenToVerify)
      } else {
        localStorage.removeItem('agrs_token')
        setUser(null)
        setToken(null)
      }
    } catch (error) {
      console.error('Token verification failed:', error)
      localStorage.removeItem('agrs_token')
      setUser(null)
      setToken(null)
    } finally {
      setIsLoading(false)
    }
  }

  const login = useCallback(async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setUser(data.user)
        setToken(data.token)
        localStorage.setItem('agrs_token', data.token)
        return { success: true, message: data.message }
      } else {
        return { success: false, message: data.detail || 'Login failed' }
      }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, message: 'Network error. Please try again.' }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
      }
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setUser(null)
      setToken(null)
      localStorage.removeItem('agrs_token')
    }
  }, [token])

  const refresh = useCallback(async () => {
    const stored = localStorage.getItem('agrs_token')
    if (!stored) {
      setUser(null)
      setToken(null)
      return
    }
    await verifyToken(stored)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refresh
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
