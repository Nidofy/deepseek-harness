type Glyph = 'environment' | 'changes' | 'branch' | 'local' | 'builds' | 'artifacts' | 'protection' | 'pets' | 'connections' | 'refresh'
const paths: Record<Glyph, string> = {
  environment: 'M3 4h18v16H3z M15 4v16', changes: 'M7 3h10v3h3v15H4V6h3z M9 13h6 M12 10v6',
  branch: 'M6 6v12 M6 12h8a4 4 0 0 0 4-4V6 M4 3h4v3H4z M16 3h4v3h-4z M4 18h4v3H4z',
  local: 'M3 3h18v13H3z M8 21h8 M12 16v5', builds: 'm8 5-5 7 5 7 M16 5l5 7-5 7 M14 3l-4 18',
  artifacts: 'M3 6h7l2 3h9v12H3z', protection: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z M8 12l3 3 5-6',
  pets: 'M5 11 3 4l7 4h4l7-4-2 7v5c0 7-14 7-14 0z M8 14h1 M15 14h1',
  connections: 'm8 8 8 8 M6 12l-2 2a4 4 0 0 0 6 6l2-2 M12 6l2-2a4 4 0 0 1 6 6l-2 2',
  refresh: 'M20 9a8 8 0 1 0 0 6 M20 3v6h-6',
}
export function Icon({ kind }: { kind: Glyph }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>
}
