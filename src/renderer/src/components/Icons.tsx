import type { ReactElement, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

const base = (props: P, children: ReactElement | ReactElement[]): ReactElement => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" {...props}>
    {children}
  </svg>
)

export const IconKeyboard = (p: P): ReactElement =>
  base(p, [
    <rect key="a" x="2" y="6" width="20" height="12" rx="2" />,
    <path key="b" d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  ])

export const IconLight = (p: P): ReactElement =>
  base(p, [
    <circle key="a" cx="12" cy="12" r="4" />,
    <path key="b" d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  ])

export const IconScreen = (p: P): ReactElement =>
  base(p, [<rect key="a" x="3" y="5" width="18" height="11" rx="1.5" />, <path key="b" d="M8 20h8M12 16v4" />])

export const IconChip = (p: P): ReactElement =>
  base(p, [
    <rect key="a" x="6" y="6" width="12" height="12" rx="1.5" />,
    <path key="b" d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
  ])

export const IconGear = (p: P): ReactElement =>
  base(p, [
    <circle key="a" cx="12" cy="12" r="3" />,
    <path key="b" d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  ])

export const IconSidebar = (p: P): ReactElement =>
  base(p, [<rect key="a" x="3" y="4" width="18" height="16" rx="2" />, <path key="b" d="M9 4v16" />])

export const IconMinus = (p: P): ReactElement => base(p, <path d="M5 12h14" />)
export const IconSquare = (p: P): ReactElement => base(p, <rect x="5" y="5" width="14" height="14" rx="1" />)
export const IconClose = (p: P): ReactElement => base(p, <path d="M6 6l12 12M18 6L6 18" />)
export const IconCheck = (p: P): ReactElement => base(p, <path d="M5 12l5 5L20 7" />)
export const IconRefresh = (p: P): ReactElement =>
  base(p, <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />)
export const IconUpload = (p: P): ReactElement => base(p, <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />)
export const IconDownload = (p: P): ReactElement => base(p, <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />)
export const IconImage = (p: P): ReactElement =>
  base(p, [
    <rect key="a" x="3" y="4" width="18" height="16" rx="2" />,
    <circle key="b" cx="9" cy="10" r="2" />,
    <path key="c" d="M21 16l-5-5-9 9" />
  ])
export const IconClock = (p: P): ReactElement =>
  base(p, [<circle key="a" cx="12" cy="12" r="9" />, <path key="b" d="M12 7v5l3 2" />])
export const IconTerminal = (p: P): ReactElement => base(p, <path d="M4 17l6-5-6-5M12 19h8" />)
export const IconChevron = (p: P): ReactElement => base(p, <path d="M6 15l6-6 6 6" />)
export const IconTrash = (p: P): ReactElement => base(p, <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />)
export const IconMacro = (p: P): ReactElement =>
  base(p, [<path key="a" d="M4 6h10M4 12h7M4 18h10" />, <path key="b" d="M17 9l4 3-4 3" />])
