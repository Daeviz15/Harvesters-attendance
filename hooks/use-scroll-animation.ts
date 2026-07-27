import { useEffect, useRef } from "react";

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
          observer.unobserve(el); 
        }
      },
      { threshold }
    );

    
    el.classList.add("scroll-hidden");
    observer.observe(el);

    return () => observer.disconnect();
  }, [threshold]);

  return ref;
}

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
