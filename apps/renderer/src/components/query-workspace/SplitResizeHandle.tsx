import { memo, useEffect, useRef } from "react";

interface SplitResizeHandleProps {
  axis: "horizontal" | "vertical";
  containerRef: React.RefObject<HTMLElement | null>;
  minPrimarySize: number;
  minSecondarySize: number;
  onChange: (ratio: number) => void;
}

export const SplitResizeHandle = memo(function SplitResizeHandle({
  axis,
  containerRef,
  minPrimarySize,
  minSecondarySize,
  onChange,
}: SplitResizeHandleProps) {
  const draggingRef = useRef(false);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!draggingRef.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const total = axis === "horizontal" ? rect.width : rect.height;
      if (total <= 0) return;

      const offset = axis === "horizontal" ? event.clientX - rect.left : event.clientY - rect.top;
      const ratio = clamp(offset / total, minPrimarySize / total, 1 - minSecondarySize / total);
      onChange(ratio);
    };

    const onPointerUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.classList.remove("is-resizing");
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [axis, containerRef, minPrimarySize, minSecondarySize, onChange]);

  return (
    <div
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        draggingRef.current = true;
        document.body.classList.add("is-resizing");
      }}
      style={axis === "horizontal" ? horizontalStyle : verticalStyle}
    />
  );
});

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const horizontalStyle: React.CSSProperties = {
  width: 5,
  flexShrink: 0,
  cursor: "col-resize",
  background: "var(--border-subtle)",
};

const verticalStyle: React.CSSProperties = {
  height: 5,
  flexShrink: 0,
  cursor: "row-resize",
  background: "var(--border-subtle)",
};
