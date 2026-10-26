import type { Component } from 'vue'
import type { TooltipPlacement } from '../tooltip'

export type ActionIconVariant = 'ghost' | 'filled' | 'outlined'
export type ActionIconTooltipPlacement = TooltipPlacement

export interface ActionIconProps {
  icon?: Component
  label?: string
  title?: string
  tooltip?: string
  tooltipPlacement?: ActionIconTooltipPlacement
  variant?: ActionIconVariant
  active?: boolean
  danger?: boolean
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit' | 'reset'
}
