// The step each home figure is showing. A detail that opens over a figure reads it to say where the reader came from.
// It lives outside the address so the home's addresses stay as they are.
const shown = new Map<string, string | null>();

export const setSceneStep = (scene: string, step: string | null) => { shown.set(scene, step); };
export const getSceneStep = (scene: string) => shown.get(scene) ?? null;
