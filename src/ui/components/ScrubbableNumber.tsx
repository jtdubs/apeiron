import { useState, useRef, useEffect } from 'react';

interface ScrubbableNumberProps {
  value: number;
  onChange: (val: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (val: number) => string;
  isLogScale?: boolean;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
}

export const ScrubbableNumber: React.FC<ScrubbableNumberProps> = ({
  value,
  onChange,
  step = 0.01,
  min = -Infinity,
  max = Infinity,
  format = (v) => v.toFixed(3),
  isLogScale = false,
  onInteractionStart,
  onInteractionEnd,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  const wheelTimeoutRef = useRef<number | null>(null);

  // Store latest props/state to avoid re-binding the wheel event listener
  const stateRef = useRef({
    value,
    isEditing,
    isLogScale,
    step,
    min,
    max,
    onChange,
    onInteractionStart,
    onInteractionEnd,
  });
  stateRef.current = {
    value,
    isEditing,
    isLogScale,
    step,
    min,
    max,
    onChange,
    onInteractionStart,
    onInteractionEnd,
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      const state = stateRef.current;
      if (state.isEditing) return;
      e.preventDefault(); // This is safe now because passive: false

      if (wheelTimeoutRef.current === null && state.onInteractionStart) {
        state.onInteractionStart();
      }

      if (wheelTimeoutRef.current !== null) {
        window.clearTimeout(wheelTimeoutRef.current);
      }

      wheelTimeoutRef.current = window.setTimeout(() => {
        if (stateRef.current.onInteractionEnd) stateRef.current.onInteractionEnd();
        wheelTimeoutRef.current = null;
      }, 150);

      // Zoom amount roughly 10x the pointer drag step per wheel "tick"
      const dir = e.deltaY < 0 ? 1 : -1;
      let newValue;
      if (state.isLogScale) {
        newValue = state.value * Math.pow(10, dir * state.step * 10);
      } else {
        newValue = state.value + dir * state.step * 10;
      }
      newValue = Math.max(state.min, Math.min(state.max, newValue));
      state.onChange(newValue);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (isEditing) return;
    e.preventDefault();

    if (onInteractionStart) onInteractionStart();

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startValue = value;

    const handlePointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      let newValue;
      if (isLogScale) {
        // e.g. step=0.01 means 100 pixels to 10x
        newValue = startValue * Math.pow(10, dx * step);
      } else {
        newValue = startValue + dx * step;
      }
      newValue = Math.max(min, Math.min(max, newValue));
      onChange(newValue);
    };

    const handlePointerUp = (ev: PointerEvent) => {
      if (onInteractionEnd) onInteractionEnd();
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const handleDoubleClick = () => {
    setInputValue(value.toString());
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      onChange(Math.max(min, Math.min(max, parsed)));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        style={{
          width: '60px',
          background: 'rgba(0,0,0,0.5)',
          color: '#fff',
          border: '1px solid #4f46e5',
          borderRadius: '4px',
          padding: '2px 4px',
          fontFamily: 'monospace',
          fontSize: '14px',
          textAlign: 'center',
          outline: 'none',
        }}
      />
    );
  }

  return (
    <span
      ref={spanRef}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      style={{
        display: 'inline-block',
        cursor: 'ew-resize',
        color: '#6ee7b7',
        fontWeight: 'bold',
        padding: '2px 4px',
        borderRadius: '4px',
        userSelect: 'none',
        touchAction: 'none',
        transition: 'background-color 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      title="Drag to adjust, scroll to adjust, double-click to edit"
    >
      {format(value)}
    </span>
  );
};
