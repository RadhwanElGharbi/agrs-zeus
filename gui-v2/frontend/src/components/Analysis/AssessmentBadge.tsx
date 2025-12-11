'use client'

import { cn } from '@/lib/utils'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import type { AssessmentLevel, ConfidenceLevel } from '@/lib/api/agenticClient'

interface AssessmentBadgeProps {
  assessment: AssessmentLevel
  confidence?: ConfidenceLevel
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  className?: string
}

const assessmentConfig = {
  favorable: {
    label: 'Favorable',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    borderColor: 'border-green-300',
    icon: CheckCircle2,
  },
  caution: {
    label: 'Caution',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-700',
    borderColor: 'border-yellow-300',
    icon: AlertTriangle,
  },
  challenging: {
    label: 'Challenging',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    borderColor: 'border-red-300',
    icon: XCircle,
  },
}

const sizeConfig = {
  sm: {
    badge: 'px-2 py-0.5 text-xs',
    icon: 'w-3 h-3',
  },
  md: {
    badge: 'px-2.5 py-1 text-sm',
    icon: 'w-4 h-4',
  },
  lg: {
    badge: 'px-3 py-1.5 text-base',
    icon: 'w-5 h-5',
  },
}

export function AssessmentBadge({
  assessment,
  confidence,
  size = 'md',
  showIcon = true,
  className,
}: AssessmentBadgeProps) {
  const config = assessmentConfig[assessment]
  const sizeClasses = sizeConfig[size]
  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full border',
        config.bgColor,
        config.textColor,
        config.borderColor,
        sizeClasses.badge,
        className
      )}
    >
      {showIcon && <Icon className={sizeClasses.icon} />}
      <span>{config.label}</span>
      {confidence && (
        <span className="opacity-70 text-xs">({confidence})</span>
      )}
    </span>
  )
}

interface ConfidenceBadgeProps {
  confidence: ConfidenceLevel
  size?: 'sm' | 'md'
  className?: string
}

const confidenceConfig = {
  high: {
    label: 'High Confidence',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
  },
  medium: {
    label: 'Medium Confidence',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
  },
  low: {
    label: 'Low Confidence',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
  },
}

export function ConfidenceBadge({
  confidence,
  size = 'sm',
  className,
}: ConfidenceBadgeProps) {
  const config = confidenceConfig[confidence]
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded',
        config.bgColor,
        config.textColor,
        sizeClasses,
        className
      )}
    >
      {config.label}
    </span>
  )
}
