import { useEffect, useRef, useState } from "react";

const defaultOptions: IntersectionObserverInit = {
  threshold: 0.1,
  rootMargin: "0px 0px -48px 0px",
};

/**
 * Sets `visible` to true once the element intersects the viewport (then disconnects).
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        obs.unobserve(el);
      }
    }, defaultOptions);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, visible };
}
