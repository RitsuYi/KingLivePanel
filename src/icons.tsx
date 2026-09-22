import { useId } from 'react';
import type { RoleId } from '../shared/model';

// Vector contours based on the supplied lane reference; all cutouts are transparent.
export function RoleGlyph({ role, className = '' }: { role: RoleId; className?: string }) {
  const silver = useId();
  return <svg className={className} viewBox="0 0 128 128" fill={`url(#${silver})`} aria-hidden="true">
    <defs><linearGradient id={silver} x1=".1" y1="0" x2=".8" y2="1" gradientUnits="objectBoundingBox"><stop stopColor="#c9dcff"/><stop offset=".48" stopColor="#f5f7ff"/><stop offset="1" stopColor="#b7cef2"/></linearGradient></defs>
    {role === 'clash' && <>
      <path d="M96 13H114V31L72 73L67 68L57 78L65 86L57 94L47 84L25 106L17 98L39 76L29 66L37 58L45 66L55 56L50 51ZM14 14H32L53 35L38 50L14 32ZM82 70L97 85L89 93L81 85L109 113L113 109L101 97L109 89L91 71Z"/>
    </>}
    {role === 'jungle' && <>
      <path fillRule="evenodd" d="M8 67C17 67 21 57 25 47C29 36 39 26 50 21L69 9L60 23C76 15 97 23 113 9C110 23 99 28 88 31C104 35 116 49 119 67C124 88 114 105 97 113C81 121 58 121 40 115C61 116 80 104 85 89C90 76 80 65 65 61L74 73L55 68L48 76L39 75L43 65L35 65L28 73L18 73ZM30 52L43 43L39 52L29 57ZM46 40C60 29 86 26 102 37C80 31 62 37 46 46ZM64 48C82 42 103 52 109 66C94 54 79 53 64 48Z"/>
      <path d="M23 47C26 32 40 19 52 15L44 25C35 30 28 38 23 47Z" opacity=".6"/>
    </>}
    {role === 'mid' && <>
      <path d="M99 8H119V28L95 52L87 54L73 70L70 81L30 120H9V99L50 59L59 56L75 40L77 31Z"/>
    </>}
    {role === 'farm' && <>
      <g transform="translate(64 64) scale(1.65) translate(-61 -61)"><path fillRule="evenodd" d="M90 61A29 29 0 1 1 32 61A29 29 0 1 1 90 61ZM83 61A22 22 0 1 0 39 61A22 22 0 1 0 83 61Z"/><path d="M69 47L59 44L48 55L65 69L60 74L50 69L45 76L60 83L77 68L59 54L62 51L67 54Z"/></g>
    </>}
    {role === 'roam' && <>
      <path d="M18 13C11 32 18 42 31 48C49 57 59 68 60 106C51 93 45 89 32 87C18 85 13 79 14 69L22 73C11 65 6 53 8 40L17 49C8 36 10 23 18 13Z"/>
      <path d="M110 13C117 32 110 42 97 48C79 57 69 68 68 106C77 93 83 89 96 87C110 85 115 79 114 69L106 73C117 65 122 53 120 40L111 49C120 36 118 23 110 13Z"/>
      <path d="M64 32L78 47L64 62L50 47Z"/>
    </>}
  </svg>;
}

export function HeartGlyph() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21 3.4 12.8C-2.9 6.4 5.7-2 12 5.1 18.3-2 26.9 6.4 20.6 12.8Z"/></svg>;
}
export function SmallIcon({ kind }: { kind: 'grid' | 'layout' | 'heart' | 'help' | 'arrow' }) {
  if (kind === 'heart') return <HeartGlyph/>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'grid' && <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>}
    {kind === 'layout' && <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 14h18M15 14v6"/></>}
    {kind === 'help' && <><circle cx="12" cy="12" r="9"/><path d="M9.8 8.6c.8-2.2 4.8-1.8 4.8 1 0 1.7-2.6 1.8-2.6 3.4M12 16.7h.01"/></>}
    {kind === 'arrow' && <><path d="M5 12h14m-5-5 5 5-5 5"/></>}
  </svg>;
}
