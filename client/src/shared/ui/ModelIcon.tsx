import { memo, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { resolveModelIcon } from './providerIcons';

export interface ModelIconProps {
  /** Hermes model id, e.g. `openai:gpt-4o-mini`. */
  model?: string | null;
  /** Pixel size; defaults to 16. */
  size?: number;
  /**
   * Color applied via `currentColor` for monochrome icons. Ignored when
   * the icon is already brand-colored.
   */
  color?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Render the brand icon for a Hermes model id. Returns `null` when the
 * provider can't be inferred so callers can decide on their own
 * fallback (e.g. a "configure model" call-to-action).
 */
const ModelIcon = memo(({ model, size = 16, color, className, style }: ModelIconProps) => {
  const resolved = useMemo(() => resolveModelIcon(model), [model]);
  if (!resolved) return null;
  const { Icon, brandColored } = resolved;
  return (
    <Icon
      size={size}
      style={{ color: brandColored ? undefined : color, ...style }}
      className={className}
    />
  );
});

ModelIcon.displayName = 'ModelIcon';

export default ModelIcon;
