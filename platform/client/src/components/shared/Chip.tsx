import type { ReactNode } from 'react';

export function Chip({
  color = '#06b6d4',
  children,
  soft = false,
  onClick,
  title,
}: {
  color?: string;
  children: ReactNode;
  /** half-transparent border (used in mockup for constraint chips) */
  soft?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <span
      onClick={onClick}
      title={title}
      className={`inline-flex items-center font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 border ${onClick ? 'cursor-pointer hover:brightness-125' : ''}`}
      style={{
        borderColor: soft ? `${color}66` : color,
        color,
        background: 'transparent',
      }}
    >
      {children}
    </span>
  );
}
