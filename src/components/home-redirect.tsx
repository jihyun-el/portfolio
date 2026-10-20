"use client";

import { useEffect } from "react";

// Takes a reader who reached a project's old address to the same thing on the home. The page carries the same script
// inline, so an address typed or followed from outside moves before anything is drawn; this covers arriving by a
// link inside the site, where an inline script does not run again.
export function homeAddress(base: string, places: Record<string, string>) {
  return `${base}/#${places[decodeURIComponent(location.hash.slice(1))] ?? places[""]}`;
}
export function HomeRedirect({ base, places }: { base: string; places: Record<string, string> }) {
  useEffect(() => { location.replace(homeAddress(base, places)); }, [base, places]);
  return null;
}
