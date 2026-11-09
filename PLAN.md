# Marble Cube Designer — Proiektuaren plana

**Bertsioa:** 0.2 (onetsita)
**Data:** 2026-11-09
**Egoera:** 1. fasea garatzen.
**Errepositorioa:** `Letitbe010/marble-cube-designer` (publikoa)

---

## 1. Helburua

Nabigatzailean exekutatzen den web aplikazio bat garatzea. Aplikazioak aukera emango du Cuboro sistemarekin bateragarriak diren bola-pistetarako egurrezko kuboak diseinatzeko, banan-banan edo pista oso baten bidez, eta kubo horiek STL formatuan esportatzeko FDM teknologiarekin inprimatu ahal izateko. Pista bat diseinatzen denean, aplikazioak automatikoki sortuko ditu behar diren kuboak.

Erabilera pertsonala da. Errepositorioa publikoa izango da GitHub-en.

## 2. Izena eta marka

- "Cuboro" Cuboro AG-ren marka erregistratua da. Proiektuak ez du izen hori erabiliko ez errepositorioaren izenean ez interfazean.
- Proposatutako izena: **`marble-cube-designer`** (aldatu daiteke).
- README fitxategian honako hau adieraziko da: "Compatible with 50 mm marble-run cubes. Not affiliated with Cuboro AG."
- Ez da Cubororen argazkirik, logotiporik edo jatorrizko materialik erabiliko.

## 3. Hartutako erabakiak

| # | Gaia | Erabakia |
|---|------|----------|
| 1 | Bateragarritasuna | 50 mm-ko sistema. Jatorrizko kuboekiko doikuntza ezin da egiaztatu (ikus 4.1); bermatzen dena da inprimatutako kuboak elkarren artean bat datozela |
| 2 | Bola | Beira eta altzairua. Diametroa: Cubororen berdina (ikus 4.1) |
| 3 | Diseinu-eredua | Sareta finkoa, konexio-puntu estandarrekin |
| 4 | Elementuak | Denak: zuzena, kurba, gurutzea, jaitsiera bertikala, barne-tunela, kanal bikoitza, eta forma bereziak (erdi-altuerako kuboak barne) |
| 5 | Pista-editorea | 3D sareta: kuboak jarri eta bidea gelaxkaz gelaxka marraztu |
| 6 | Fisika | Egiaztapen geometrikoa lehenik; simulazioa geroago, pixkanaka |
| 7 | Berrerabilpena | Kubo berdinak (biraketak barne) talde bakarrean, kantitatearekin |
| 8 | Inprimagailua | FDM, 0,4 mm-ko tobera |
| 9 | Inprimaketa | Barne-tunelak dituzten kuboak bi zatitan, euskarririk gabe |
| 10 | Esportazioa | STL bat kubo-mota bakoitzeko, ZIP batean, zerrendarekin |
| 11 | Akabera | Ertz txaflanatuak eta ID grabatua |
| 12 | Arkitektura | Nabigatzailean soilik, zerbitzaririk gabe, GitHub Pages-en |
| 13 | Biltegiratzea | localStorage + JSON inportazio/esportazioa |
| 14 | Gailua | Ordenagailua |
| 15 | Hizkuntzak | Euskara, gaztelania, ingelesa |
| 16 | Errepositorioa | Publikoa |
| 17 | MVP | Kubo bakarraren editorea → STL → inprimatze-proba |
| 18 | Garapena | Claudek idazten du kodea; erabiltzaileak exekutatu eta probatzen du |

0,4 mm-ko tobera estandarra da eta egokia da proiektu honetarako: kanalen eta ertzen xehetasun-mailak ez du tobera finagorik behar.

## 4. Zehaztapen geometrikoak

### 4.1 Egiaztatutako datuak eta suposizioak

| Parametroa | Balioa | Egoera | Iturria |
|---|---|---|---|
| Kuboaren aldea | 50 mm | Egiaztatuta (saltzaileak) | [Manufactum](https://manufactum.com/cuboro-building-set-standard-a211666), 2026-11 |
| Bolaren diametroa | 16 mm edo 17 mm | **Iturriek ez datoz bat** | [Cuboro Australia](https://cuboroaustralia.squarespace.com/marbles/cuboro-marbles) (17 mm); [The Wooden Wagon](https://www.thewoodenwagon.com/woodentoy/CCU230.html) (16 mm), 2026-11 |
| Kanalaren, tunelaren eta zuloaren diametroa | 18,5 mm | **Suposizioa**: 17 mm-ko bola + 1,5 mm-ko jokoa; 16 mm-ko bolak ere balio du | Proiektuaren erabakia |
| Goiko kanalaren zentroaren altuera | 44 mm | **Suposizioa** | Proiektuaren erabakia |
| Tunelaren zentroaren altuera | 19 mm | **Suposizioa** | Proiektuaren erabakia |

**Ondorioa:** erabiltzaileak ez du jatorrizko kuborik, eta beraz neurri horiek ezin dira erkatu. Neurri guztiak parametroak dira `src/geometry/config.ts` fitxategian. Bermatzen dena hau da: proiektu honekin inprimatutako kuboak elkarren artean bat datoz. Jatorrizko Cuboro kuboekiko doikuntza ez dago egiaztatuta. Altzairuzko bolak beirazkoen diametro berekoak izan beharko dira.

### 4.2 Konexio-eredua (portuak)

Kuboak konexio-puntu finkoen ("portuen") bidez lotzen dira. Portuak aurpegien erdian daude horizontalki, baina altuera-maila ezberdinetan egon daitezke.

- **Alboko aurpegi bakoitzean (4)**, maila bakoitzeko portu bat dago. Mailak zerrenda diskretu eta konfiguragarri bat dira:
  - `T` (top): goiko kanalaren irteera.
  - `M` (middle): barne-tunelaren irteera.
- **Goiko aurpegia:** `U` portua, erdian (jaitsiera bertikalaren sarrera).
- **Beheko aurpegia:** `D` portua, erdian (jaitsiera bertikalaren irteera).

Portu bat `(aurpegia, maila)` bikotea da. Altuera jarraituak ez dira onartzen, ondoko kuboen arteko lotura eta pistaren banaketa automatikoa maila diskretuen menpe daudelako.

Mailak gehitu daitezke `src/geometry/config.ts` fitxategian, baina 50 mm-tan kanal bat eta tunel bat bakarrik sartzen dira horma seguruekin. Konfigurazioaren egiaztapenak baztertu egiten ditu 2,5 mm baino horma meheagoa uzten duten mailak.

Guztira 10 portu daude. Kubo baten edukia **segmentu-zerrenda bat** da; segmentu bakoitzak bi portu lotzen ditu (adib. `N.T → E.T` goiko kurba bat da). Maila ezberdinetako portuak lotzen dituen segmentua arrapala bat da.

### 4.3 Elementu-katalogoa

| Elementua | Segmentuak (adibidea) |
|---|---|
| Zuzena (goian) | `N.T → S.T` |
| Kurba (goian) | `N.T → E.T` |
| Gurutzea (goian) | `N.T → S.T` + `E.T → W.T` |
| Jaitsiera | `N.T → U`, `U → D` |
| Tunela | `N.M → S.M`, `N.M → E.M` |
| Goitik tunelera | `U → E.M` |
| Kanal bikoitza | goiko segmentuak + tuneleko segmentuak |
| Erdi-altuerako kuboa | 25 mm-ko kuboa, `T` portuekin bakarrik (2. fasea) |

### 4.4 3D inprimaketarako parametroak

- Tolerantzia orokorra: kuboaren aldea −0,2 mm (doigarria), elkarren ondoan sartu ahal izateko.
- Ertzetako txaflana: 1 mm (doigarria).
- ID grabatua beheko aurpegian, 0,6 mm-ko sakoneran.
- **Bi zatiko banaketa:** barne-tunela duten kuboak tunelaren ardatzaren planoan zatitzen dira. Zati bakoitza aurpegi lauaren gainean inprimatzen da, euskarririk gabe. Lotura: 4 pin-zulo (3 mm-ko pin bat edo filamentu-zati bat sartzeko) eta, aukeran, kola.
- Tunel itxiek malko-itxurako sabaia dute (45°-ko hegalak), zatitu gabe ere euskarririk gabe inprimatu ahal izateko.

## 5. Arkitektura teknikoa

| Geruza | Teknologia | Arrazoia |
|---|---|---|
| Hizkuntza | TypeScript | Akatsak goiz detektatzeko |
| Build | Vite | Azkarra; GitHub Pages-erako erraza |
| 3D bista | Three.js | Estandarra eta ondo dokumentatuta |
| Geometria (CSG) | manifold-3d (WASM) | Sare itxiak eta inprimagarriak bermatzen ditu |
| Esportazioa | STL (binarioa) + JSZip | Slicer guztiekin bateragarria |
| Interfazea | HTML/CSS + framework arin bat (Preact edo framework gabe) | Mendekotasun gutxi |
| i18n | JSON fitxategiak (`eu`, `es`, `en`) | Sinplea, liburutegirik gabe |
| Testak | Vitest | Geometria eta pista-banaketa egiaztatzeko |
| Argitalpena | GitHub Actions → GitHub Pages | Doakoa, automatikoa |

### 5.1 Datu-eredua (laburpena)

```ts
type Port = `${'N'|'E'|'S'|'W'}.${'T'|'M'}` | 'U' | 'D';
interface Segment { from: Port; to: Port; }
interface CubeDesign { id: string; height: 'full' | 'half'; segments: Segment[]; }
interface PlacedCube { cubeId: string; x: number; y: number; z: number; rotation: 0|90|180|270; }
interface Track { name: string; cubes: PlacedCube[]; start: { x: number; y: number; z: number; port: Port }; }
```

### 5.2 Pistatik kubora (algoritmoa)

1. Erabiltzaileak bidea marrazten du saretan; gelaxka bakoitzean sarrera- eta irteera-portuak erregistratzen dira.
2. Gelaxka bakoitzeko segmentu-multzoa kubo-diseinu bihurtzen da.
3. Diseinu bakoitza forma kanonikora normalizatzen da (Z ardatzaren inguruko 4 biraketak konparatuz).
4. Berdinak taldekatu eta kantitatea zenbatzen da.
5. Egiaztapena: bidea jarraitua da, ez du gorantz egiten, eta portu bakoitza ondoko kuboaren portuarekin bat dator.

## 6. Faseak

| Fasea | Edukia | Irteera | Onarpen-irizpidea |
|---|---|---|---|
| **0. Kalibrazioa** | Kalibrazio-pieza inprimatu (kuboa + kanala + tunel-zatia) eta bolaren joanaldia eta kuboen arteko doikuntza probatu | Parametro doituak `src/geometry/config.ts`-n | Bola kanalean eta tunelean ondo ibiltzen da; bi kubo elkarren ondoan sartzen dira |
| **1. MVP** | Errepositorioa, kubo bakarraren editorea, 3D bista, STL esportazioa | Web app GitHub Pages-en | Inprimatutako bi kubo elkarren ondoan sartzen dira eta bola batetik bestera igarotzen da |
| **2. Katalogoa** | Elementu guztiak, bi zatiko banaketa, ID grabatua, txaflanak, ZIP | Kubo-liburutegia | Tuneldun kuboak euskarririk gabe inprimatzen dira |
| **3. Pista-editorea** | 3D sareta, bidea marraztea, automatikoki banatzea, taldekatzea, egiaztapen geometrikoa | Pista osoaren ZIP-a | 10 kubotik gorako pista bat muntatu eta funtzionatzen du |
| **4. Hobekuntzak** | Hiru hizkuntzak osorik, erdi-altuerako kuboak, 3MF, bolaren animazioa | — | — |
| **5. Fisika (aukerakoa)** | Simulazio sinplea (abiadura, jauziak) | — | — |

Hiru hizkuntzen egitura 1. fasetik egongo da prest. Itzulpen osoak 4. fasean egingo dira.

## 7. Arriskuak

| Arriskua | Eragina | Arintzea |
|---|---|---|
| Neurri ofizialak ez daude publiko eta ez dago erreferentziazko kuborik | Jatorrizko kuboekin bat ez etortzea | Onartutako muga. Sistema barne-koherentea da; jatorrizko kubo bat eskuratuz gero, parametroak doitu |
| FDM-ren dimentsio-errorea | Kuboak ez dira sartzen | Tolerantzia parametrikoa + kalibrazio-kubo bat |
| Kanalen gainazal zakarra (geruzak) | Bola gelditzen da | Kanalaren sekzioa zabalagoa; inprimatzeko orientazioa zaindu |
| CSG motela nabigatzailean | Esperientzia txarra | manifold-3d (azkarra) + emaitzen cachea |

## 8. Erabakitako galderak (2026-11-09)

1. Ez dago jatorrizko kuborik: garapenak suposizio parametrikoekin jarraitzen du.
2. Portuak aurpegien erdian daude, altuera ezberdinetan egon daitezkeelarik.
3. GitHub erabiltzailea: `Letitbe010`.
4. Proiektuaren izena: `marble-cube-designer`.
