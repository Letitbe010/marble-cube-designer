# Marble Cube Designer

A browser tool for designing 50 mm wooden-style marble-run cubes and exporting them as STL files for FDM 3D printing. Everything runs locally in the browser; no data leaves your computer.

**Not affiliated with Cuboro AG.** Compatible in concept with 50 mm marble-run cubes. Fit with commercial cubes has not been verified: dimensions are assumptions, stored as parameters in [`src/geometry/config.ts`](src/geometry/config.ts).

## Run it locally

Requires [Node.js](https://nodejs.org) 22.12 or newer.

```bash
npm install
npm run dev
```

Then open the address it prints, usually <http://localhost:5173>.

## Check it

```bash
npm test
```

## How a cube is described

A cube is a list of **segments**, each joining two **ports**. Ports sit at the centre of a face, at a fixed height level:

| Port | Meaning |
|---|---|
| `N.T`, `E.T`, `S.T`, `W.T` | Top groove exit on that face |
| `N.M`, `E.M`, `S.M`, `W.M` | Tunnel exit on that face |
| `U` / `D` | Vertical hole through the top / bottom |

## Before printing a full cube

Use **Calibration piece** in the app. It exports a thin slice containing a groove and a tunnel. Print two standing as exported, without supports: check that the ball runs freely through both and that they sit side by side. Then adjust `ballDiameter`, `boreClearance` and `fitClearance` if needed.

See [PLAN.md](PLAN.md) for the roadmap.
