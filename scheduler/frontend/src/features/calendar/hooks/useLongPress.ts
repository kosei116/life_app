import { useCallback, useRef } from 'react';

interface Options {
  onLongPress: () => void;
  onClick?: () => void;
  onDragMove?: (x: number, y: number) => void;
  onDragEnd?: (x: number, y: number) => void;
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
  onDragMove,
  onDragEnd,
  thresholdMs = 500,
  moveTolerancePx = 8,
}: Options) {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<Pointer | null>(null);
  const firedRef = useRef(false);
  const draggingRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      firedRef.current = false;
      draggingRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };
      const target = e.currentTarget as Element;
      const pointerId = e.pointerId;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        firedRef.current = true;
        if (onDragEnd || onDragMove) {
          draggingRef.current = true;
          target.setPointerCapture?.(pointerId);
        }
        onLongPress();
      }, thresholdMs);
    },
    [onLongPress, thresholdMs, onDragEnd, onDragMove],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (draggingRef.current) {
        onDragMove?.(e.clientX, e.clientY);
        return;
      }
      if (!startRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (Math.hypot(dx, dy) > moveTolerancePx) clear();
    },
    [clear, moveTolerancePx, onDragMove],
  );

  const onPointerUp = useCallback(
    (e?: React.PointerEvent) => {
      clear();
      if (draggingRef.current && onDragEnd && e) {
        onDragEnd(e.clientX, e.clientY);
      } else if (!firedRef.current && onClick) {
        onClick();
      }
      draggingRef.current = false;
      startRef.current = null;
    },
    [clear, onClick, onDragEnd],
  );

  const onPointerCancel = useCallback(() => {
    clear();
    draggingRef.current = false;
    startRef.current = null;
  }, [clear]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
