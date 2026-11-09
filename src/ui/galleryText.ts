import type { Lang } from './i18n';

interface Text {
  name: string;
  note: string;
}

export const GALLERY_TEXT: Record<string, Record<Lang, Text>> = {
  firstRun: {
    eu: { name: 'Lehen jaitsiera', note: 'Hasierako blokea, malda bat eta geldiunea. Inprimatzen hasteko egokiena.' },
    es: { name: 'Primera bajada', note: 'Bloque inicial, una pendiente y una parada. El mejor para empezar a imprimir.' },
    en: { name: 'First run', note: 'Start block, one ramp and a stop. The best one to start printing.' },
  },
  stairs: {
    eu: { name: 'Eskailera', note: 'Hainbat malda jarraian, maila bakoitzean behera.' },
    es: { name: 'Escalera', note: 'Varias pendientes seguidas, bajando un nivel cada vez.' },
    en: { name: 'Stairs', note: 'Several ramps in a row, one level down each time.' },
  },
  longRamp: {
    eu: { name: 'Malda luzea', note: 'Hiru eta bi unitateko malda baxuak.' },
    es: { name: 'Pendiente larga', note: 'Pendientes bajas de tres y dos unidades.' },
    en: { name: 'Long ramp', note: 'Low ramps three and two units long.' },
  },
  wave: {
    eu: { name: 'Uhin-bidea', note: 'Hiru unitateko uhin-profila.' },
    es: { name: 'Camino ondulado', note: 'Perfil ondulado de tres unidades.' },
    en: { name: 'Wave road', note: 'A wave profile three units long.' },
  },
  leftRight: {
    eu: { name: 'Ezkerra eta eskuina', note: 'Maldadun kurbak bi noranzkoetan.' },
    es: { name: 'Izquierda y derecha', note: 'Curvas en pendiente en los dos sentidos.' },
    en: { name: 'Left and right', note: 'Sloping curves in both directions.' },
  },
  funnelTunnel: {
    eu: { name: 'Inbututik tunelera', note: 'Inbutua, tunel kurbatua eta tunel zuzenak.' },
    es: { name: 'Del embudo al túnel', note: 'Embudo, túnel curvo y túneles rectos.' },
    en: { name: 'Funnel to tunnel', note: 'A funnel, a curved tunnel and straight tunnels.' },
  },
  downTheHole: {
    eu: { name: 'Zuloan behera', note: 'Kanika pieza barrutik erortzen da azpiko maldara.' },
    es: { name: 'Por el agujero', note: 'La canica cae por dentro de la pieza a la pendiente inferior.' },
    en: { name: 'Down the hole', note: 'The marble falls through the piece onto the ramp below.' },
  },
  jump: {
    eu: { name: 'Jauzia', note: '25 mm-ko jauzi bat pieza batetik bestera.' },
    es: { name: 'El salto', note: 'Un salto de 25 mm entre dos piezas.' },
    en: { name: 'The jump', note: 'A 25 mm jump from one piece to the next.' },
  },
  bridge: {
    eu: { name: 'Zubia', note: 'Pista bat arku eta zutabeen gainean.' },
    es: { name: 'El puente', note: 'Una pista sobre arcos y columnas.' },
    en: { name: 'The bridge', note: 'A track on arches and columns.' },
  },
  hiddenTunnel: {
    eu: { name: 'Tunel ezkutua', note: 'Bidea bere azpitik pasatzen da pieza berean.' },
    es: { name: 'Túnel oculto', note: 'El camino pasa por debajo de sí mismo en la misma pieza.' },
    en: { name: 'Hidden tunnel', note: 'The track passes under itself in the same piece.' },
  },
  lowTrack: {
    eu: { name: 'Pista baxua', note: 'Erdi-altuerako piezak bakarrik.' },
    es: { name: 'Pista baja', note: 'Solo piezas de media altura.' },
    en: { name: 'Low track', note: 'Half-height pieces only.' },
  },
  spiralDescent: {
    eu: { name: 'Espirala', note: 'Malda bat espiralera, eta azpiko zuloan amaiera.' },
    es: { name: 'La espiral', note: 'Una pendiente hacia la espiral, con final en el agujero inferior.' },
    en: { name: 'The spiral', note: 'A ramp into the spiral, ending in its bottom hole.' },
  },
  twinSpirals: {
    eu: { name: 'Bi espiral', note: 'Bi kanika, espiral ezkerra eta eskuina.' },
    es: { name: 'Dos espirales', note: 'Dos canicas, espiral izquierda y derecha.' },
    en: { name: 'Twin spirals', note: 'Two marbles, a left and a right spiral.' },
  },
  tower: {
    eu: { name: 'Dorrea', note: 'Bi bira beherantz, kurbak tuneletan.' },
    es: { name: 'La torre', note: 'Dos vueltas hacia abajo, con las curvas en túnel.' },
    en: { name: 'The tower', note: 'Two laps downward, with the bends in tunnels.' },
  },
  bigLoop: {
    eu: { name: 'Begizta handia', note: 'Bira handi bat, eta bidea bere azpitik.' },
    es: { name: 'Gran bucle', note: 'Una vuelta grande, pasando por debajo de sí mismo.' },
    en: { name: 'Big loop', note: 'A wide lap that passes under itself.' },
  },
  chamber: {
    eu: { name: 'Ganbera', note: 'Eskailera bat eta ganbera batean amaiera.' },
    es: { name: 'La cámara', note: 'Una escalera con final en una cámara.' },
    en: { name: 'The chamber', note: 'A staircase ending in a chamber.' },
  },
  race: {
    eu: { name: 'Lasterketa', note: 'Bi kanika bi pista paralelotan.' },
    es: { name: 'La carrera', note: 'Dos canicas en dos pistas paralelas.' },
    en: { name: 'The race', note: 'Two marbles on two parallel tracks.' },
  },
  crossroads: {
    eu: { name: 'Bidegurutzea', note: 'Bi kanika gurutze batetik, une ezberdinetan.' },
    es: { name: 'El cruce', note: 'Dos canicas por un cruce, en momentos distintos.' },
    en: { name: 'Crossroads', note: 'Two marbles through a crossing, at different times.' },
  },
  convoy: {
    eu: { name: 'Segida', note: 'Bi kanika bide beretik, bata bestearen atzetik.' },
    es: { name: 'En fila', note: 'Dos canicas por el mismo camino, una tras otra.' },
    en: { name: 'Convoy', note: 'Two marbles on one track, one behind the other.' },
  },
  launcher: {
    eu: { name: 'Bultzagailua', note: 'Pendulu batek kanika abiarazten du, eta malda batetik gora igotzen da.' },
    es: { name: 'El lanzador', note: 'Un péndulo lanza la canica, que sube por una rampa.' },
    en: { name: 'The launcher', note: 'A pendulum launches the marble up a ramp.' },
  },
  catapult: {
    eu: { name: 'Katapulta', note: 'Bultzagailuak kanika malda batean gora botatzen du, eta tuneletatik behera itzultzen da.' },
    es: { name: 'La catapulta', note: 'El lanzador sube la canica por una rampa, y vuelve a bajar por túneles.' },
    en: { name: 'The catapult', note: 'The launcher sends the marble up a ramp, and it comes back down through tunnels.' },
  },
  castle: {
    eu: { name: 'Gaztelua', note: 'Dorre bat eta bidea bere azpitik itzultzen da.' },
    es: { name: 'El castillo', note: 'Una torre con el camino que vuelve por debajo de sí mismo.' },
    en: { name: 'The castle', note: 'A tower whose track comes back underneath itself.' },
  },
  serpentine: {
    eu: { name: 'Sugea', note: 'Hiru errenkada dohain, tuneletako bira itxiekin.' },
    es: { name: 'La serpiente', note: 'Tres filas en zigzag con giros en túnel.' },
    en: { name: 'The serpent', note: 'Three rows back and forth, with bends in tunnels.' },
  },
  terraces: {
    eu: { name: 'Terrazak', note: 'Arrapala askeak eta tunelak maila ezberdinetan.' },
    es: { name: 'Las terrazas', note: 'Rampas libres y túneles a distintos niveles.' },
    en: { name: 'The terraces', note: 'Free ramps and tunnels at different levels.' },
  },
  viaduct: {
    eu: { name: 'Bidezubia', note: 'Pista luzea zutabe eta arku-ilaren gainean.' },
    es: { name: 'El viaducto', note: 'Una pista larga sobre columnas y arcos.' },
    en: { name: 'The viaduct', note: 'A long track on columns and arches.' },
  },
  crossover: {
    eu: { name: 'Bi maila', note: 'Bi kanika gurutzatzen dira, bata bestearen gainetik.' },
    es: { name: 'A dos niveles', note: 'Dos canicas se cruzan, una por encima de la otra.' },
    en: { name: 'Two levels', note: 'Two marbles cross, one above the other.' },
  },
  twinMerge: {
    eu: { name: 'Bi kale bat', note: 'Bi kanika kale banatan, eta Y batean elkartzen dira.' },
    es: { name: 'Dos carriles en uno', note: 'Dos canicas en carriles separados que se unen en una Y.' },
    en: { name: 'Two lanes into one', note: 'Two marbles on separate lanes joining at a Y.' },
  },
  spiralTower: {
    eu: { name: 'Espiral-dorrea', note: 'Eskailera luzea espiral batean amaitzen da.' },
    es: { name: 'Torre espiral', note: 'Una larga escalera que termina en una espiral.' },
    en: { name: 'Spiral tower', note: 'A long staircase ending in a spiral.' },
  },
  seesawJunction: {
    eu: { name: 'Balantzina', note: 'Kanika balantzinara erortzen da, eta bi irteera ditu.' },
    es: { name: 'El balancín', note: 'La canica cae sobre el balancín, que tiene dos salidas.' },
    en: { name: 'The seesaw', note: 'The marble drops onto the seesaw, which has two exits.' },
  },
  finale: {
    eu: { name: 'Amaiera handia', note: 'Inbutua, tunelak, eskailera eta ganbera batean amaiera.' },
    es: { name: 'Gran final', note: 'Embudo, túneles, escalera y final en una cámara.' },
    en: { name: 'Grand finale', note: 'A funnel, tunnels, stairs and a chamber at the end.' },
  },
  leanZigzag: {
    eu: { name: 'Sigi-saga', note: 'Arrapala askeak ezker-eskuin, tunel-kurbekin.' },
    es: { name: 'Zigzag', note: 'Rampas libres a un lado y otro, con curvas en túnel.' },
    en: { name: 'Zigzag', note: 'Free ramps from side to side, with tunnel bends.' },
  },
  hiddenLoopTower: {
    eu: { name: 'Begizta-dorrea', note: 'Dorre batetik begizta batera, bidea bere azpitik.' },
    es: { name: 'Torre con bucle', note: 'De una torre a un bucle que pasa bajo sí mismo.' },
    en: { name: 'Loop tower', note: 'From a tower into a loop that passes under itself.' },
  },
  grandTour: {
    eu: { name: 'Bira handia', note: 'Tunelak, kurbak, zuloa eta espirala muntaia luze batean.' },
    es: { name: 'Gran recorrido', note: 'Túneles, curvas, agujero y espiral en un largo montaje.' },
    en: { name: 'Grand tour', note: 'Tunnels, bends, a hole and a spiral in one long build.' },
  },
  showcase: {
    eu: { name: 'Erakusketa', note: 'Tunelak, uhina, zuloa eta espirala muntaia batean.' },
    es: { name: 'Exposición', note: 'Túneles, onda, agujero y espiral en un mismo montaje.' },
    en: { name: 'Showcase', note: 'Tunnels, a wave, a hole and a spiral in one assembly.' },
  },
};
