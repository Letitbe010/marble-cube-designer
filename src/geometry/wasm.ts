import Module, { type ManifoldToplevel } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';

/** Loads the geometry kernel in the browser, pointing it at the bundled wasm file. */
export async function loadManifold(): Promise<ManifoldToplevel> {
  const wasm = await Module({ locateFile: () => wasmUrl });
  wasm.setup();
  return wasm;
}
