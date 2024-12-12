import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
export function useBasicLayout() {
  const breakpoints = useBreakpoints(breakpointsTailwind)
  const isMobile = breakpoints.smaller('sm')
  const isSmallMd = breakpoints.smaller('md')
  const isSmallLg = breakpoints.smaller('lg')
  const isSmallXl = breakpoints.smaller('xl')

  return { isMobile, isSmallMd, isSmallLg, isSmallXl }
}
