import { useEffect, type RefObject } from "react";

// The turning buttons of every home screen stand half way down the screen, whatever the height of its head, so they
// keep one place as the reader goes from screen to screen. `--mid` is that height measured from the top of `ref`.
// It is read from the layout, not from the boxes on screen: a screen that zooms in or out as it is shown is measured
// while it is scaled, and the buttons would keep that place once the zoom is over.
const top = (el: HTMLElement) => { let y = 0; for (let at: Element | null = el; at instanceof HTMLElement; at = at.offsetParent) y += at.offsetTop; return y; };
export function useSceneMiddle(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const box = ref.current, scene = box?.closest<HTMLElement>(".browser-scenes>article");
    if (!box || !scene) return;
    const place = () => {
      if (!box.offsetParent) return;
      box.style.setProperty("--mid", `${top(scene) + scene.offsetHeight / 2 - top(box)}px`);
    };
    const watch = new ResizeObserver(place);
    watch.observe(scene); watch.observe(box); place();
    return () => watch.disconnect();
  }, [ref]);
}
