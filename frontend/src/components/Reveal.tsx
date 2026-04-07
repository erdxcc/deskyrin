import type { CSSProperties, ReactNode } from "react";
import { useReveal } from "../hooks/useReveal";

const ease = "cubic-bezier(0.16, 1, 0.3, 1)";
const durationMs = 2100;

type RevealProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Extra delay after intersect before transition starts (stagger). */
  delayMs?: number;
};

export function Reveal({
  children,
  className = "",
  style: styleProp,
  delayMs = 0,
}: RevealProps) {
  const { ref, visible } = useReveal<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...styleProp,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(36px)",
        transitionProperty: "opacity, transform",
        transitionDuration: `${durationMs}ms`,
        transitionTimingFunction: ease,
        transitionDelay: visible ? `${delayMs}ms` : "0ms",
        willChange: visible ? "auto" : "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
