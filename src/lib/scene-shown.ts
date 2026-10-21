import { createContext, useContext, useEffect, useRef } from "react";

// Whether the home screen a figure stands on is the one showing. A figure outside the home is always shown.
export const SceneShown = createContext(true);

// Runs `leave` when the figure's screen stops showing, so the reader who comes back finds it at its start.
// A detail opened over the screen does not count as leaving it.
export function useSceneLeave(leave: () => void) {
  const shown = useContext(SceneShown), was = useRef(shown), run = useRef(leave);
  run.current = leave;
  useEffect(() => { if (was.current && !shown) run.current(); was.current = shown; }, [shown]);
}
