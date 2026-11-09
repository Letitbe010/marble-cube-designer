import type { Face, Port } from '../geometry/ports';
import type { LevelId } from '../geometry/config';

export type Lang = 'eu' | 'es' | 'en';
export const LANGS: Lang[] = ['eu', 'es', 'en'];

const STRINGS = {
  eu: {
    hint: 'Aukeratu pieza bat edo egin klik bi portutan 3D bistan, kanal bat sortzeko.',
    presets: 'Piezak',
    straightTop: 'Zuzena (goian)',
    curveTop: 'Kurba (goian)',
    crossTop: 'Gurutzea (goian)',
    drop: 'Jaitsiera',
    straightTunnel: 'Tunel zuzena',
    curveTunnel: 'Tunel kurbatua',
    topToTunnel: 'Goitik tunelera',
    double: 'Kanal bikoitza',
    custom: 'Kanal pertsonalizatua',
    add: 'Gehitu',
    segments: 'Kanalak',
    empty: 'Kubo hutsa. Gehitu kanal bat.',
    remove: 'Kendu',
    clear: 'Dena garbitu',
    export: 'Esportatu',
    exportStl: 'Deskargatu STL',
    calibration: 'Kalibrazio-pieza (STL)',
    calibrationHint: '15 mm-ko xerra bat, kanalarekin eta tunelarekin. Lehen inprimatu hau, bola eta doikuntza probatzeko.',
    xray: 'Gardena (tunelak ikusteko)',
    stats: 'Bolumena: {volume} cm³ · {tris} triangelu',
    samePort: 'Kanal batek ezin ditu portu bera bi aldiz lotu.',
    sameFace: 'Ezin dira aurpegi bereko bi portu lotu.',
    duplicate: 'Kanal hori badago jada.',
    thinWall: 'Kontuz: bi kanal oso hurbil daude eta horma meheegia utz dezakete.',
    pieces: 'Kuboa zatitan banatu da. Aldatu kanalak.',
    failed: 'Ezin izan da kuboa sortu.',
    loading: 'Kargatzen…',
    disclaimer: 'Ez dago Cuboro AG-rekin lotuta. Neurriak suposizioak dira: inprimatu kalibrazio-pieza lehenik.',
  },
  es: {
    hint: 'Elige una pieza o haz clic en dos puertos en la vista 3D para crear un canal.',
    presets: 'Piezas',
    straightTop: 'Recta (arriba)',
    curveTop: 'Curva (arriba)',
    crossTop: 'Cruce (arriba)',
    drop: 'Bajada',
    straightTunnel: 'Túnel recto',
    curveTunnel: 'Túnel curvo',
    topToTunnel: 'De arriba a túnel',
    double: 'Canal doble',
    custom: 'Canal personalizado',
    add: 'Añadir',
    segments: 'Canales',
    empty: 'Cubo vacío. Añade un canal.',
    remove: 'Quitar',
    clear: 'Limpiar todo',
    export: 'Exportar',
    exportStl: 'Descargar STL',
    calibration: 'Pieza de calibración (STL)',
    calibrationHint: 'Una rebanada de 15 mm con canal y túnel. Imprímela primero para probar la bola y el ajuste.',
    xray: 'Transparente (ver túneles)',
    stats: 'Volumen: {volume} cm³ · {tris} triángulos',
    samePort: 'Un canal no puede unir un puerto consigo mismo.',
    sameFace: 'No se pueden unir dos puertos de la misma cara.',
    duplicate: 'Ese canal ya existe.',
    thinWall: 'Atención: dos canales están muy cerca y pueden dejar una pared demasiado fina.',
    pieces: 'El cubo se ha partido en trozos. Cambia los canales.',
    failed: 'No se ha podido generar el cubo.',
    loading: 'Cargando…',
    disclaimer: 'Sin relación con Cuboro AG. Las medidas son suposiciones: imprime primero la pieza de calibración.',
  },
  en: {
    hint: 'Pick a piece, or click two ports in the 3D view to create a channel.',
    presets: 'Pieces',
    straightTop: 'Straight (top)',
    curveTop: 'Curve (top)',
    crossTop: 'Cross (top)',
    drop: 'Drop',
    straightTunnel: 'Straight tunnel',
    curveTunnel: 'Curved tunnel',
    topToTunnel: 'Top to tunnel',
    double: 'Double channel',
    custom: 'Custom channel',
    add: 'Add',
    segments: 'Channels',
    empty: 'Empty cube. Add a channel.',
    remove: 'Remove',
    clear: 'Clear all',
    export: 'Export',
    exportStl: 'Download STL',
    calibration: 'Calibration piece (STL)',
    calibrationHint: 'A 15 mm slice with a groove and a tunnel. Print this first to test the ball and the fit.',
    xray: 'See-through (show tunnels)',
    stats: 'Volume: {volume} cm³ · {tris} triangles',
    samePort: 'A channel cannot connect a port to itself.',
    sameFace: 'Two ports on the same face cannot be connected.',
    duplicate: 'That channel already exists.',
    thinWall: 'Warning: two channels are very close and may leave a wall too thin to print.',
    pieces: 'The cube has split into pieces. Change the channels.',
    failed: 'The cube could not be generated.',
    loading: 'Loading…',
    disclaimer: 'Not affiliated with Cuboro AG. Dimensions are assumptions: print the calibration piece first.',
  },
} as const;

export type StringKey = keyof (typeof STRINGS)['en'];

const FACE_NAMES: Record<Lang, Record<Face, string>> = {
  eu: { N: 'Iparra', E: 'Ekialdea', S: 'Hegoa', W: 'Mendebaldea' },
  es: { N: 'Norte', E: 'Este', S: 'Sur', W: 'Oeste' },
  en: { N: 'North', E: 'East', S: 'South', W: 'West' },
};

const LEVEL_NAMES: Record<Lang, Record<LevelId, string>> = {
  eu: { T: 'kanala', M: 'tunela' },
  es: { T: 'canal', M: 'túnel' },
  en: { T: 'groove', M: 'tunnel' },
};

const VERTICAL_NAMES: Record<Lang, Record<'U' | 'D', string>> = {
  eu: { U: 'Goiko zuloa', D: 'Beheko zuloa' },
  es: { U: 'Agujero superior', D: 'Agujero inferior' },
  en: { U: 'Top hole', D: 'Bottom hole' },
};

export function translate(lang: Lang, key: StringKey, values: Record<string, string> = {}): string {
  return Object.entries(values).reduce<string>((text, [k, v]) => text.replace(`{${k}}`, v), STRINGS[lang][key]);
}

export function portName(lang: Lang, port: Port): string {
  if (port === 'U' || port === 'D') return VERTICAL_NAMES[lang][port];
  const [face, level] = port.split('.') as [Face, LevelId];
  return `${FACE_NAMES[lang][face]} · ${LEVEL_NAMES[lang][level]}`;
}
