"use client";

import Link from "next/link";

// Returns to where the reader came from on this site (keeping their place on the home page);
// a visitor who arrived straight from an application link goes to the home page's projects.
export function BackLink() {
  return <Link className="back-link" href="/#projects" onClick={(event) => {
    const fromHere = document.referrer && new URL(document.referrer).origin === location.origin;
    if (fromHere && history.length > 1) { event.preventDefault(); history.back(); }
  }}>돌아가기</Link>;
}
