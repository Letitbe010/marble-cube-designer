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
| `N.T.0`, `E.T.0`, `S.T.0`, `W.T.0` | Top groove exit on that face (centre 50 mm up) |
| `N.M.0`, `E.M.0`, `S.M.0`, `W.M.0` | Tunnel exit on that face (centre 25 mm up) |
| `N.B.0`, `E.B.0`, `S.B.0`, `W.B.0` | Underside groove exit on that face (centre at the base) |
| `U.0` / `D.0` | Vertical hole through the top / bottom |

The last digit is the lane; only the centre lane exists for now. Bores are 17 mm, for 16 mm marbles.

## Before printing a full cube

Use **Calibration piece** in the app. It exports a thin slice containing all three channel levels. Print two standing as exported, without supports: check that the ball runs freely through both and that they sit side by side. Then adjust `ballDiameter`, `boreClearance` and `fitClearance` if needed.

See [PLAN.md](PLAN.md) for the roadmap.
