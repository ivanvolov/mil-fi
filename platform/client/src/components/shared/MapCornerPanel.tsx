import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';

const BASE = 'bottom-4 right-4 z-[1001] bg-panel border border-line shadow-2xl';

/**
 * A small floating panel pinned to the bottom-right corner of the MAP area — not the browser
 * viewport. It portals into the map shell (`<main id="map-shell">`) so it lands inside the map even
 * though the dialog that renders it lives elsewhere in the tree (e.g. the left rail). Falls back to
 * the fixed viewport corner if the shell isn't mounted.
 */
export function MapCornerPanel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const shell = typeof document !== 'undefined' ? document.getElementById('map-shell') : null;
  if (shell) {
    return createPortal(
      <div className={`absolute ${BASE}`} style={style}>{children}</div>,
      shell,
    );
  }
  return <div className={`fixed ${BASE}`} style={style}>{children}</div>;
}
