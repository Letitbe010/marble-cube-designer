import { cavityFits } from './cavities';
import { CAVITY_TYPES, normalizeBody, SHAPES, UNIT_BODY, type Body, type Cavity, type Channel, type PieceSpec, type Port } from './ports';
import { adaptChannels } from './validate';

export const WIDTHS = [1, 2];
export const LENGTHS = [1, 2, 3];
export const HEIGHTS = [0.5, 1, 1.5, 2, 3, 4];

/** Designs saved before lanes existed use ports like "N.T"; they now read "N.T.0". */
const migratePort = (port: string) => (/\.-?\d$/.test(port) ? port : `${port}.0`) as Port;

function loadBody(raw: Partial<Body> | undefined): Body {
  const size = raw?.size;
  const valid = size?.length === 3 && WIDTHS.includes(size[0]) && LENGTHS.includes(size[1]) && HEIGHTS.includes(size[2]);
  if (!valid || !raw?.shape || !SHAPES.includes(raw.shape)) return UNIT_BODY;
  return normalizeBody({ shape: raw.shape, size });
}

/** Rebuilds a piece from stored data, dropping whatever no longer fits. */
export function parseSpec(data: { spec?: Partial<PieceSpec>; channels?: unknown; segments?: unknown }): PieceSpec {
  const body = loadBody(data.spec?.body);
  const stored = (data.spec?.channels ?? data.channels ?? data.segments) as (Partial<Channel> & { from: string; to: string })[];
  const channels = adaptChannels(
    stored.map((s) => ({ ...s, from: migratePort(s.from), to: migratePort(s.to) }) as Channel),
    body,
  );
  const cavities = ((data.spec?.cavities ?? []) as Cavity[]).filter((c) => CAVITY_TYPES.includes(c.type) && cavityFits(c, body));
  return { body, channels, cavities };
}
