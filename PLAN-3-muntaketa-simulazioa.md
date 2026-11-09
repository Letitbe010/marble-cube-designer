# Muntaketa eta simulazioaren plana

**Bertsioa:** 0.2 (onetsita, 2026-11-09)
**Data:** 2026-11-09
**Aurrekoak:** [PLAN.md](PLAN.md), [PLAN-2-piezak.md](PLAN-2-piezak.md)

---

## 1. Helburua

Inprimatu aurretik, sortutako piezekin zirkuitu oso bat muntatzea eta kanika batek edo gehiagok zirkuitu horretan egingo luketena aurreikustea, geometria- eta diseinu-akatsak plastikoa gastatu baino lehen detektatzeko.

## 2. Irismena

| Barruan | Kanpoan (lehen bertsioan) |
|---|---|
| Piezak 3D saretan jarri, biratu eta pilatu | Bidea marraztu eta piezak automatikoki sortu (ikus 3.1) |
| Loturen eta euskarrien egiaztapena | Fisika-motor osoa |
| Kanalen gaineko simulazioa, 1 edo 2 kanikarekin | Pieza mugikorrak (balantzina) simulatzea |
| Jauzi laburrak eta gurutzeetako topaketak | Kanika arteko talken ondorengo mugimendua |

## 3. Erabaki nagusiak

### 3.1 Muntaketa da sarrera nagusia

Muntaketa-atala [PLAN-2-piezak.md](PLAN-2-piezak.md) dokumentuko 6. pausoaren (pistaren editorea) oinarria da, ez haren gehigarria. Hasierako planeko "bidea marraztu" modua atzeratu egiten da: piezak zuzenean jartzeak erabiltzailearen ideia hobeto jasotzen du eta 2-3 gelaxkako piezekin ere balio du.

### 3.2 Simulazioa kanalen gainean

Kanika kanalaren erdiko lerroan higitzen da, eta dimentsio bakarreko mugimendua kalkulatzen da. Fisika-motor bat (talka errealekin) baztertu da, 16 mm-ko kanika batek 17 mm-ko kanalean 1 mm-ko jokoa baino ez duelako: horrek oso urrats txikiak eskatzen ditu, eta emaitza ezegonkorra izateko arriskua du.

Muga onartua: ereduak ez ditu ikusten kanikaren alboko errebotea edo kanaletik irten ondorengo ibilbidea.

## 4. Muntaketa

### 4.1 Datu-eredua

```ts
interface PlacedPiece {
  id: string;
  spec: PieceSpec;
  /** Grid position: X and Y in 50 mm cells, Z in 25 mm steps. */
  cell: [number, number, number];
  rotation: 0 | 90 | 180 | 270;
}
interface Assembly { name: string; pieces: PlacedPiece[]; }
```

### 4.2 Editorearen funtzioak

- Liburutegitik pieza bat aukeratu eta saretan jarri, aurrebista batekin.
- Biratu, mugitu, bikoiztu eta ezabatu; desegin eta berregin.
- Muntaia JSON gisa gorde eta kargatu, eta nabigatzailean automatikoki gorde.
- Pieza-zerrenda: pieza berdinak (biraketak barne) talde bakarrean, kantitatearekin.
- ZIP esportazioa: STL bat pieza-mota bakoitzeko, zerrendarekin.

### 4.3 Egiaztapenak

| Kodea | Egiaztapena | Maila |
|---|---|---|
| `overlap` | Bi piezak gelaxka bera betetzen dute | Errorea |
| `unsupported` | Pieza batek ez du ezer azpian | Errorea |
| `openExit` | Irteera bat ez dago hurrengo piezari lotuta | Abisua |
| `blockedExit` | Irteera bat ondoko pieza trinko baten kontra dago | Errorea |
| `levelMismatch` | Sarrera irteera baino gorago dago, edo jauzia 25 mm baino handiagoa da | Errorea |

Lotura-araua PLAN-2-piezak.md dokumentuko 2.3 atalekoa da.

## 5. Simulazioa

### 5.1 Grafoa

Pieza bakoitzaren kanalak `channelPath` funtziotik lortzen dira, munduko koordenatuetara pasatzen dira, eta portuen arteko lotura-grafo bat osatzen dute. Gurutze batean kanikak norabide zuzenena duen kanaletik jarraitzen du. Hasiera-puntuak aurreko sarrerarik ez duten goiko sarrerak dira; erabiltzaileak alda ditzake.

### 5.2 Mugimendu-eredua

Erorketarik gabe errodatzen duen esfera baten azelerazioa:

`a = (5/7) · g · (sin θ − Crr · cos θ)`

Denbora-urratsa finkoa da (1 ms), emaitza berdina izan dadin exekuzio guztietan. Beste elementuak:

- **Jauzia:** parabola, irteerako abiaduratik hurrengo piezaren sarrerara. Talkan abiaduraren zati bat galtzen da.
- **Junturak:** pieza-aldaketa bakoitzean abiadura-galera txiki bat.
- **Kurbak kanal irekian:** kanika kanpoko hormara igotzen da `tan φ = v² / (R · g)` angeluan. `φ` muga gainditzean, kanika kanaletik irten da. Tuneletan ez da aplikatzen.

### 5.3 Parametroak

Balio guztiak **suposizioak** dira, inprimatutako piezekin neurtu arte.

| Parametroa | Hasierako balioa | Neurtzeko modua |
|---|---|---|
| Errodadura-koefizientea `Crr` | 0,02 (tartea 0,01–0,05) | Malda ezagun batetik bota eta kanal lauan egindako distantzia neurtu |
| Junturan gordetzen den abiadura | % 95 | Pieza bat eta hainbat piezaren arteko distantziak alderatu |
| Jauzian gordetzen den abiadura | % 70 | Jauzia duen eta ez duen pista alderatu |
| Kurbako angelu-muga `φ` | 60° | Abiadura handituz, kanika noiz irteten den ikusi |

Adibidez, `R = 25 mm` eta `φ = 60°` izanik, abiadura-muga 0,65 m/s ingurukoa da. Hori kalkulu teorikoan 30 mm inguruko jaitsiera baten pareko abiadura da: kurba ireki bat jaitsiera handi baten ondoren jartzea arriskutsua izan daiteke.

### 5.4 Kanikak

- Lehenetsita, kanika bat hasiera-puntu bakoitzean, eta erabiltzaileak 1 edo 2 aukera ditzake. Kanala bakarra bada, bigarren kanika atzerapen doigarri batekin abiatzen da.
- Bi kaniken zentroak kanika-diametro bat baino hurbilago daudenean, topaketa gisa markatzen da eta kokapena eta unea erakusten dira. Topaketaren ondorengo mugimendua ez da simulatzen.

### 5.5 Emaitzak

Simulazioa hiru aldiz exekutatzen da `Crr` balioaren tartearekin (baxua, ertaina, altua), eta emaitza hau ematen du:

| Emaitza | Esanahia |
|---|---|
| **Ondo** | Hiru kasuetan kanika helmugara iristen da |
| **Mugan** | Kasu batzuetan bakarrik iristen da |
| **Arazoa** | Kasu guztietan huts egiten du |

Huts egiteko arrazoiak: gelditu da, kurban irten da, lotura falta da, topaketa izan da. Bakoitza 3D bistan markatzen da, eta arrazoian klik eginez kamera puntu horretara doa.

### 5.6 Interfazea

Muntaketa eta Simulazioa fitxak; hasi, gelditu eta abiadura (0,25x–2x); ibilbidea abiaduraren araberako koloreekin; denbora, abiadura maximoa eta emaitza.

## 6. Pausoak

| # | Pausoa | Onarpen-irizpidea | Egiaztapena |
|---|---|---|---|
| **M1** | Muntaia-eredua eta 3D bista | Piezak biratuta jarri eta JSON-etik berreskuratzen dira | Testak eta nabigatzailea |
| **M2** | Egiaztapenak eta pieza-zerrenda | 4.3 ataleko kode bakoitzak bere testa du; biratutako piezak talde berean | Testak |
| **M3** | ZIP esportazioa | ZIP-eko pieza-kopurua zerrendarekin bat dator | Testak |
| **S1** | Grafoa eta kanika bakarra | Biratutako pista berak denbora bera ematen du; 50 mm-ko jaitsiera batean abiadura 0,84 m/s da (`Crr = 0`, ±% 1) | Testak |
| **S2** | Jauziak, kurbak eta gelditzeak | Huts egiteko arrazoi bakoitzak proba-pista bat du | Testak |
| **S3** | Animazioa eta emaitzak | Pista batek hiru emaitzak erakuts ditzake parametroen arabera | Nabigatzailea |
| **S4** | Bi kanika eta topaketak | Gurutze batean aldi berean iristean topaketa markatzen da | Testak |
| **S5** | Kalibrazioa | Neurtutako parametroekin, pista erreal baten emaitza eta simulazioa bat datoz | Inprimaketa (PLAN-2, 9. pausoa) |

M1–M3 pausoek PLAN-2-piezak.md dokumentuko 6. pausoa ordezkatzen dute. S1–S4 pausoak hura amaitu ondoren egin daitezke, eta 7. eta 8. pausoen aurretik egitea gomendatzen da. Kanal bikoitzak eta Y bidegurutzeak gehitzean, 5.1 ataleko grafoa zabaldu beharko da.

## 7. Arriskuak

| Arriskua | Eragina | Arintzea |
|---|---|---|
| Parametroak neurtu gabe daude S5 arte | Emaitza orientagarria baino ez da | Hiru kasuko emaitza; interfazean argi adierazi |
| Simulazioak "Ondo" esan eta errealitatean huts egin | Inprimaketa alferrikakoa | Lehenik pista txiki bat inprimatu eta alderatu |
| Elementu bereziak (inbutua, ontzia, espirala) ez dira kanal soilak | Eredu berezia behar dute | Inbutua eta espirala kanal baliokide gisa; ontzia helmuga gisa |
| Datu-eredua aldatzen ari da | Birlanketa | M1 PieceSpec egonkortu ondoren hasi |

## 8. Onartutakoa (2026-11-09)

1. Muntaketa sarrera nagusia izatea (3.1).
2. Kanalen gaineko simulazioa, fisika-motorrik gabe (3.2).
3. 6. ataleko pausoen ordena.
