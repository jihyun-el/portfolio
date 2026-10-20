"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Elements stay visible without JavaScript; the rise animation only runs once they scroll into view.
export function Reveal() {
  const pathname = usePathname();
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add("in"); observer.unobserve(entry.target); }
    }), { threshold: 0.15 });
    document.querySelectorAll(".reveal:not(.in)").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
