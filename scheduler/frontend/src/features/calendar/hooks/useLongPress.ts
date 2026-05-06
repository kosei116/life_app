import { useCallback, useRef } from 'react';

interface Options {
  onLongPress: () => void;
  onClick?: () => void;
  thresholdMs?: number;
  moveTolerancePx?: number;
}

interface Pointer {
  x: number;
  y: number;
}

export function useLongPress({
  onLongPress,
  onClick,
  thresholdMs = 500,
  moveTolerancePx = 8,
}: Options) {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<Pointer | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      firedRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true;
        onLongPress();
      }, thresholdMs);
    },
    [onLongPress, thresholdMs],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (Math.hypot(dx, dy) > moveTolerancePx) clear();
    },
    [clear, moveTolerancePx],
  );

  const onPointerUp = useCallback(() => {
    clear();
    if (!firedRef.current && onClick) onClick();
    startRef.current = null;
  }, [clear, onClick]);

  const onPointerCancel = useCallback(() => {
    clear();
    startRef.current = null;
  }, [clear]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
