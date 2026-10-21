import { useEffect, type RefObject } from "react";

// The turning buttons of every home screen stand half way down the screen, whatever the height of its head, so they
// keep one place as the reader goes from screen to screen. `--mid` is that height measured from the top of `ref`.
export function useSceneMiddle(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const box = ref.current, scene = box?.closest<HTMLElement>(".browser-scenes>article");
    if (!box || !scene) return;
    const place = () => {
      if (!box.offsetParent) return;
      const a = scene.getBoundingClientRect(), b = box.getBoundingClientRect();
      box.style.setProperty("--mid", `${(a.top + a.height / 2 - b.top).toFixed(1)}px`);
    };
    const watch = new ResizeObserver(place);
    watch.observe(scene); watch.observe(box); place();
    return () => watch.disconnect();
  }, [ref]);
}
