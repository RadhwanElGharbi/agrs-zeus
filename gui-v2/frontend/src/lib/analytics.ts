/**
 * AGRS ZEUS Analytics Tracker
 * Tracks user interactions, navigation, and behavior for demo analytics.
 */

import { API_BASE_URL } from '@/lib/api-client'

interface AnalyticsEvent {
  event_type: string
  component?: string
  action?: string
  target?: string
  value?: any
  page?: string
  metadata?: Record<string, any>
  timestamp?: string
  session_duration?: number
}

class AnalyticsTracker {
  private sessionStart: number
  private eventQueue: AnalyticsEvent[] = []
  private flushInterval: NodeJS.Timeout | null = null
  private isEnabled: boolean = true

  constructor() {
    this.sessionStart = Date.now()

    // Start flush interval (send events every 5 seconds)
    if (typeof window !== 'undefined') {
      this.flushInterval = setInterval(() => this.flush(), 5000)

      // Flush on page unload
      window.addEventListener('beforeunload', () => this.flush())

      // Track page visibility changes
      document.addEventListener('visibilitychange', () => {
        this.track('visibility', 'document', document.visibilityState)
      })

      // Track clicks globally
      document.addEventListener('click', (e) => this.handleGlobalClick(e), true)

      // Track scroll depth
      let maxScroll = 0
      window.addEventListener('scroll', () => {
        const scrollPercent = Math.round(
          (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
        )
        if (scrollPercent > maxScroll) {
          maxScroll = scrollPercent
          if (maxScroll % 25 === 0) {
            this.track('scroll_depth', 'window', `${maxScroll}%`)
          }
        }
      })
    }
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null
    return sessionStorage.getItem('agrs_token')
  }

  private handleGlobalClick(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (!target) return

    // Get useful identifiers
    const tagName = target.tagName.toLowerCase()
    const id = target.id
    const className = target.className
    const text = target.textContent?.slice(0, 50)
    const dataAction = target.getAttribute('data-action')

    // Track buttons and interactive elements
    if (tagName === 'button' || target.closest('button')) {
      const button = target.closest('button') || target
      this.track('click', 'Button', button.textContent?.trim().slice(0, 30) || 'Unknown', {
        id: button.id,
        className: (button as HTMLElement).className
      })
    }

    // Track links
    if (tagName === 'a' || target.closest('a')) {
      const link = (target.closest('a') || target) as HTMLAnchorElement
      this.track('click', 'Link', link.href || link.textContent?.slice(0, 30), {
        text: link.textContent?.trim().slice(0, 30)
      })
    }

    // Track inputs getting focus
    if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') {
      this.track('focus', tagName, id || className.slice(0, 30))
    }

    // Track map interactions
    if (target.closest('.maplibregl-canvas-container')) {
      this.track('click', 'Map', 'map_canvas')
    }

    // Track custom data-action elements
    if (dataAction) {
      this.track('click', 'Action', dataAction, { tagName, id })
    }
  }

  /**
   * Track an analytics event
   */
  track(
    eventType: string,
    component?: string,
    action?: string,
    metadata?: Record<string, any>
  ) {
    if (!this.isEnabled) return

    const event: AnalyticsEvent = {
      event_type: eventType,
      component,
      action: typeof action === 'string' ? action : JSON.stringify(action),
      page: typeof window !== 'undefined' ? window.location.pathname : undefined,
      timestamp: new Date().toISOString(),
      session_duration: Math.round((Date.now() - this.sessionStart) / 1000),
      metadata
    }

    this.eventQueue.push(event)

    // Immediate flush for important events
    if (['error', 'login', 'logout', 'navigation'].includes(eventType)) {
      this.flush()
    }
  }

  /**
   * Track page navigation
   */
  trackNavigation(from: string, to: string) {
    this.track('navigation', 'Router', to, { from })
  }

  /**
   * Track input changes (debounced - call on blur or submit)
   */
  trackInput(inputName: string, value: any, component?: string) {
    // Don't track passwords
    if (inputName.toLowerCase().includes('password')) {
      this.track('input', component || 'Input', inputName, { hasValue: !!value })
    } else {
      this.track('input', component || 'Input', inputName, { value })
    }
  }

  /**
   * Track errors
   */
  trackError(error: string, component?: string, metadata?: Record<string, any>) {
    this.track('error', component || 'App', error, metadata)
  }

  /**
   * Track feature usage
   */
  trackFeature(featureName: string, action: string, metadata?: Record<string, any>) {
    this.track('feature', featureName, action, metadata)
  }

  /**
   * Track project-specific actions
   */
  trackProject(projectName: string, action: string, metadata?: Record<string, any>) {
    this.track('project', projectName, action, metadata)
  }

  /**
   * Flush event queue to server
   */
  async flush() {
    if (this.eventQueue.length === 0) return

    const eventsToSend = [...this.eventQueue]
    this.eventQueue = []

    const token = this.getToken()

    try {
      await fetch(`${API_BASE_URL}/analytics/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ events: eventsToSend })
      })
    } catch (error) {
      // Re-add events to queue on failure
      this.eventQueue = [...eventsToSend, ...this.eventQueue]
      console.warn('Failed to send analytics:', error)
    }
  }

  /**
   * Enable/disable tracking
   */
  setEnabled(enabled: boolean) {
    this.isEnabled = enabled
  }

  /**
   * Clean up
   */
  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
    }
    this.flush()
  }
}

// Singleton instance
export const analytics = typeof window !== 'undefined' ? new AnalyticsTracker() : null

// Convenience functions
export function trackEvent(eventType: string, component?: string, action?: string, metadata?: Record<string, any>) {
  analytics?.track(eventType, component, action, metadata)
}

export function trackNavigation(from: string, to: string) {
  analytics?.trackNavigation(from, to)
}

export function trackInput(inputName: string, value: any, component?: string) {
  analytics?.trackInput(inputName, value, component)
}

export function trackError(error: string, component?: string, metadata?: Record<string, any>) {
  analytics?.trackError(error, component, metadata)
}

export function trackFeature(featureName: string, action: string, metadata?: Record<string, any>) {
  analytics?.trackFeature(featureName, action, metadata)
}

export function trackProject(projectName: string, action: string, metadata?: Record<string, any>) {
  analytics?.trackProject(projectName, action, metadata)
}
