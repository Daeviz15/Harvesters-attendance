import { useEffect, useRef } from "react";

/**
 * Custom hook that observes an element and adds/removes CSS classes
 * when it enters/leaves the viewport. Perfect for scroll-triggered
 * reveal animations.
 *
 * @param threshold Intersection ratio to trigger (0-1, default 0.15)
 * @returns A ref to attach to the element you want to observe
 */
export function useScrollAnimation<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.15
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("scroll-visible");
          el.classList.remove("scroll-hidden");
          observer.unobserve(el); // animate once
        }
      },
      { threshold }
    );

    // Start hidden
    el.classList.add("scroll-hidden");
    observer.observe(el);

    return () => observer.disconnect();
  }, [threshold]);

  return ref;
}

/**
 * Observe multiple children inside a container for staggered reveal.
 * Each direct child gets `scroll-hidden` and a `stagger-N` class,
 * then is revealed when it enters the viewport.
 *
 * @param selector CSS selector for children to animate (default: "> *")
 */
export function useStaggerAnimation<T extends HTMLElement = HTMLDivElement>(
  selector = ":scope > *",
  threshold = 0.1
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const children = container.querySelectorAll(selector);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("scroll-visible");
            entry.target.classList.remove("scroll-hidden");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold }
    );

    children.forEach((child, i) => {
      child.classList.add("scroll-hidden", `stagger-${i + 1}`);
      observer.observe(child);
    });

    return () => observer.disconnect();
  }, [selector, threshold]);

  return ref;
}
