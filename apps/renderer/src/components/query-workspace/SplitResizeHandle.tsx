import { memo, useEffect, useRef, type CSSProperties } from "react";

interface SplitResizeHandleProps {
  axis: "horizontal" | "vertical";
  containerRef: React.RefObject<HTMLElement | null>;
  minPrimarySize: number;
  minSecondarySize: number;
  onChange: (ratio: number) => void;
  thickness?: number;
}

export const SplitResizeHandle = memo(function SplitResizeHandle({
  axis,
  containerRef,
  minPrimarySize,
  minSecondarySize,
  onChange,
  thickness = 6,
}: SplitResizeHandleProps) {
  const draggingRef = useRef(false);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;

      event.preventDefault();
      window.getSelection()?.removeAllRanges();

      const rect = containerRef.current.getBoundingClientRect();
      const totalSize = axis === "horizontal" ? rect.width : rect.height;
      const position = axis === "horizontal"
        ? event.clientX - rect.left
        : event.clientY - rect.top;

      if (totalSize <= 0) return;

      const ratio = Math.max(
        minPrimarySize / totalSize,
        Math.min(position / totalSize, 1 - minSecondarySize / totalSize),
      );
      onChange(ratio);
    };

    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.classList.remove("is-resizing");
      document.body.style.removeProperty("--app-resize-cursor");
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [axis, containerRef, minPrimarySize, minSecondarySize, onChange]);

  useEffect(() => () => {
    document.body.classList.remove("is-resizing");
    document.body.style.removeProperty("--app-resize-cursor");
  }, []);

  const isHorizontal = axis === "horizontal";
  const guideStyle: CSSProperties = isHorizontal
    ? {
      position: "absolute",
      left: "50%",
      top: 10,
      bottom: 10,
      width: 1,
      transform: "translateX(-50%)",
    }
    : {
      position: "absolute",
      left: 12,
      right: 12,
      top: "50%",
      height: 1,
      transform: "translateY(-50%)",
    };

  return (
    <div
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        draggingRef.current = true;
        document.body.classList.add("is-resizing");
        document.body.style.setProperty("--app-resize-cursor", isHorizontal ? "col-resize" : "row-resize");
        window.getSelection()?.removeAllRanges();
      }}
      style={{
        flex: `0 0 ${thickness}px`,
        alignSelf: "stretch",
        position: "relative",
        cursor: isHorizontal ? "col-resize" : "row-resize",
        background: "transparent",
        userSelect: "none",
      }}
    >
      <div style={{ ...guideStyle, background: "var(--border-subtle)" }} />
    </div>
  );
});
