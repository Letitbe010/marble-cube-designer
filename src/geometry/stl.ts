/** Encodes an indexed triangle mesh as a binary STL file. */
export function toBinaryStl(positions: Float32Array, triangles: Uint32Array, name: string): ArrayBuffer {
  const count = triangles.length / 3;
  const buffer = new ArrayBuffer(84 + 50 * count);
  const view = new DataView(buffer);

  const header = new TextEncoder().encode(name.slice(0, 80));
  new Uint8Array(buffer, 0, 80).set(header);
  view.setUint32(80, count, true);

  let offset = 84;
  for (let i = 0; i < count; i++) {
    const v = [0, 1, 2].map((k) => {
      const index = triangles[i * 3 + k] * 3;
      return [positions[index], positions[index + 1], positions[index + 2]];
    });
    const u = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
    const w = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const length = Math.hypot(n[0], n[1], n[2]) || 1;

    for (const value of [n[0] / length, n[1] / length, n[2] / length, ...v[0], ...v[1], ...v[2]]) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
    offset += 2; // attribute byte count, unused
  }
  return buffer;
}
