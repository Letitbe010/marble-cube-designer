# Pieza-familien plana

**Bertsioa:** 0.3 (2026-11-09: finkatze-interfazea, hasierako blokea, pieza simetrikoak eta bultzagailua gehituta)
**Data:** 2026-11-09
**Aurrekoa:** [PLAN.md](PLAN.md), 1. fasea.

---

## 1. Helburua

Aplikazioa kubo bakarreko kanal-editore izatetik pieza-sistema oso izatera pasatzea: tamaina eta forma ezberdinak, malda duten kanalak, elementu bereziak, kanal bikoitzak eta pieza mugikorrak. Pistaren editoreak pieza horiek guztiak erabili ahal izango ditu.

## 2. Erabaki nagusiak

### 2.1 Eredu parametrikoa

Pieza bakoitza ez da kodean idatziko. Datu-egitura bat izango da, hiru osagairekin:

| Osagaia | Edukia |
|---|---|
| **Gorputza** | Forma eta neurriak, sareta-unitatetan |
| **Ezaugarriak** | Gorputzari kentzen zaizkion kanalak eta hutsuneak |
| **Inprimaketa** | Orientazioa eta zatiketa |

Liburutegiko pieza bat parametro-multzo bat besterik ez da. Forma bat gehitzeko nahikoa da datuak gehitzea, eta soilik forma guztiz berriek behar dute kode berria.

```ts
interface PieceSpec {
  body: { shape: 'box' | 'cylinder' | 'halfCylinder' | 'arch' | 'roof'; size: [number, number, number] };
  channels: Channel[];
  cavities: Cavity[];
  print: { upsideDown?: boolean; splitPlane?: 'x' | 'y' | 'z' };
}
interface Channel { from: Port; to: Port; section: 'groove' | 'slot' | 'tunnel' | 'underside'; profile: 'flat' | 'linear' | 'wave'; }
interface Cavity { type: 'funnel' | 'stop' | 'basin' | 'crossBasin' | 'chamber' | 'spiral'; position: [number, number]; size: number; }
```

### 2.2 Altuera-mailak 25 mm-ko saretan

Irudiek gaur egungo geometria aldatzera behartzen dute. Argazkian bolak erdia baino gehiago ageri du kanal gainean, eta tunelak bi erdi-altuerako piezen arteko junturan agertzen dira. Hortik ondorioztatzen da (**inferentzia, neurtu gabe**) bolaren zentroak 25 mm-ko sareta batean daudela:

| Maila | Zentroaren altuera | Erabilera | Horma kalkulatua |
|---|---|---|---|
| Azpiko kanala | 0 mm | Azpialdetik irekia | — |
| Tunela | 25 mm | Tunel itxia edo bi piezaren juntura | 4,48 mm alde bakoitzean |
| Goiko kanala | 50 mm | Goitik irekia | Kanalaren hondoa 41,5 mm-tan |

Hiru mailak batera sartzen dira 17 mm-ko diametroarekin (16 mm-ko bola + 1 mm-ko jokoa). Balio berriek baliogabetzen dute 1. faseko kalibrazio-pieza; berriz inprimatu beharko da.

### 2.3 Pieza arteko lotura

Maila bakarreko lotura zorrotza ez da nahikoa, malda duten piezek altuera ezberdinean uzten dutelako bola. Arau berria: irteera sarreraren maila berean edo gorago egon daiteke, gehienez 25 mm-ko jauziarekin.

### 2.4 Izenak eta katalogoa

Piezak familia generiko eta parametroen bidez definituko dira, izen propioekin. Irudietako kodeak, marrazkiak eta katalogo komertziala ez dira errepositorioan sartuko, eta ez da pieza-zerrenda hori banan-banan kopiatuko: errepositorioa publikoa da. Familiek funtzio horiek guztiak estaltzen dituzte.

### 2.5 Finkatze-interfazea (F pausoa)

PLAko piezek pisu eta marruskadura txikia dute, eta kanikaren kolpeek desplaza ditzakete. Kalkulu teorikoan (kuboa 50 g, marruskadura 0,25, kanika 1 m/s-tan, talka frontala, hirurak suposizioak), goiko kubo soltea 2 mm inguru mugitzen da beirazko kanikarekin eta 13 mm inguru altzairuzkoarekin.

Gridfinity sistemaren printzipioa hartzen da (forma alakatuak, bere kabuz zentratzen direnak), baina ez bere neurriak: gure sarea 50 mm-koa da, eta perimetro osoko ertzak goiko kanal irekiekin talka egingo luke. Erabakia:

| Elementua | Geometria (hasierako balioak, probatzeko) |
|---|---|
| Kuboaren goialdea | Lau tetoi izkinetan: oina 8 × 8 mm, altuera 3 mm, 45°-ko alakak eta 1-1,5 mm-ko zati zuzena |
| Kuboaren azpialdea | Tetoiei dagozkien lau poltsa, 0,2 mm-ko jokoarekin alde bakoitzean eta ahoan alaka txikiarekin |
| Oinarri-plaka | Kuboaren goialdearen interfaze bera gelaxka bakoitzean |

Geometria bakarrak balio du azpiko baserako eta zutabean pilatzeko, eta 90°-ko biraketa guztiak onartzen ditu. Zati zuzenak kuboa arrapalan gora igotzea eragozten du.

Inplementazioan erabakitakoa (2026-11-09): tetoien zentroa gelaxkaren ertzetik 6 mm-ra dago eta zati zuzena 1,25 mm-koa da. Poltsak puntan amaitzen dira (5,45 mm-ko sakonera), sabai laurik gabe, zubirik gabe inprimatzeko. Tetoiak bloke-formetan bakarrik jartzen dira; poltsak forma guztietan. Kanal edo hutsune baten gainean geratuko litzatekeen tetoia kendu egiten da, eta aplikazioak abisua ematen du. Plaka 4 mm-ko lodierakoa da, azpiko geruzaren laukizuzena estaltzen du, eta 4 × 4 gelaxkako zatietan banatzen da; zatiak oraindik ez dira elkarri lotzen.

Kanal bikoitzekin (7. pausoa): goiko bi kanalek izkinetako tetoien zatia hartzen dute, eta tetoi horiek kendu egiten dira abisuarekin. Poltsak mantentzen dira, beraz pieza horiek azpikoari lotuta geratzen dira, baina gainean ezin da beste pieza bat finkatu.

Mugak: goiko aurpegia ez da laua (Cuboro errealekin bateragarritasuna galtzen da; erabiltzaileak ez du horrelakorik); 3 mm-ko tetoiek ez dute altxatzea eragozten; plakaren tamaina ohantzeak mugatzen du, eta pista handietan plaka-zatiak lotu beharko dira. Inbutuek, espiralak eta kanal bikoitzek izkinak libre uzten dituztela egiaztatu behar da. Altzairuzko kanika erabiltzen denez, imanak ez dira hartzen sistema nagusitzat.

### 2.6 Hasierako blokea

Kanika geldi hartzen duen eta zirkuitua abiarazten duen pieza. Goiko aurpegiaren erdian ontzi txiki bat du, eta handik kanal ireki bat irteten da: 8 mm lauan, gero `M` mailako alboko portura jaisten da. Ontzia irteerako kanalaren hondoa baino 1 mm sakonagoa da, eta ertz horrek kanika geldirik mantentzen du bultzada txiki bat jaso arte. Altuera osokoa eta erdi-altuerakoa daude. Simulazioan bultzada hori 200 mm/s-koa dela suposatzen da (`releaseSpeed`).

### 2.7 Pieza simetrikoak

Biraketa batek ezin du norabide batera bakarrik biratzen duen pieza baten ispilu-irudia sortu. Maldadun kurbek eta espiralak bi bertsio dituzte (ezkerrera eta eskuinera). Maila bereko kurbek ez dute behar, biratuta edo alderantziz erabilita bi noranzkoak estaltzen dituztelako.

### 2.8 Kanika-bultzagailua (10. pausoa, azkena)

Helburua: kanika abiaraztea edo gora bidaltzea, Cuboro-ren KICK luzapenaren funtzioaren antzera. Saltzaileen arabera, KICK-ek mailu bat erabiltzen du kanika gora bidaltzeko, mailua altzairu herdoilgaitzezkoa da eta aurretik prestatu egin behar da ([Blue Otter Toys](https://www.blueottertoys.com/products/cuboro-extension-set-kick-marble-run), [The Wooden Wagon](https://thewoodenwagon.com/woodentoy/CCU213.html), kontsulta 2026-11-09). Barneko mekanismoa **ez dago egiaztatuta**, eta ez da haren diseinua kopiatuko: diseinu propioa izango da.

Lehen proposamena: pisu baten pendulua, ardatzarekin (8. pausoko ardatz bera, joko 0,3 mm). Erabiltzaileak jasotzen du, eta askatzean kanika jotzen du. Abantailak: ez du malgukirik behar (PLAk fluentzia du karga iraunkorrean) eta energia errepikagarria da.

| Kalkulu teorikoa (50 g-ko pisua, 50 mm-ko erorketa, talka elastiko ideala) | Altzairua (16,8 g) | Beira (5,4 g) |
|---|---|---|
| Kanikaren abiadura | 1,5 m/s inguru | 1,8 m/s inguru |
| Gehienezko igoera, galerarik gabe | 110 mm inguru | 160 mm inguru |

Benetako balioak txikiagoak izango dira (PLAk kolpea xurgatzen du, eta marruskadura dago). Horregatik, pisuaren kolpea jasotzeko gainazal metalikoa erabiliko da, eta balioa neurtu egingo da. **Bideragarritasuna:** kanika horizontalki abiaraztea bideragarria da; maila bat (50 mm) igotzea litekeena da; zirkuitu itxia (kanika hasierara itzultzea) ez da bermatzen. Finkatze-interfazea (2.5) aurrebaldintza da, kolpeak piezak mugitu baititzake.

### 2.9 Kanika-igogailua (11. pausoa, azkena)

Helburua: kanikak zirkuituaren amaieratik hasierara igotzea, begizta jarraituak sortzeko. Erabiltzaileak azken pausotzat utzi du, eta eskakizun handikoa da. Oraingoz plangintza da; balio guztiak **suposizioak** dira, eta 9. pausoko probak behar dituzte.

| Aukera | Abantailak | Eragozpenak | Balorazioa |
|---|---|---|---|
| Torloju helikoidala (Arkimedes) | Jarraitua, kanikak banan-banan igotzen ditu, modularra | Pieza luzea, doitasun handia; PLA-ren marruskadura | **Gomendatua** |
| Gurpil poltsaduna | Sinplea, oso fidagarria | Altuera gurpilaren erradioak mugatzen du | Altuera txikietarako alternatiba |
| Ontzidun uhala edo katea | Altuera handia | Pieza asko, tentsioa behar du | Altuera oso handietarako bakarrik |

**Gomendioa:** torloju helikoidala, 100 mm-ko modulu pilagarrietan, ardatz baten inguruan biratuz, motor batekin. Lehen bertsiorako, DC motor erredukzioduna edo urrats-motorra, eta elikatze-iturri bat. Arduino bat ez da nahitaezkoa torlojua biratzeko; erabilgarria da sentsore batekin (kanika sartu dela detektatzeko), motorra piztu eta itzaltzeko eta zarata eta higadura murrizteko.

**Diseinuaren baldintzak:**

- Beheko sarrerak saretako `S.M` edo `S.T` portu batekin lotu behar du, eta goiko irteerak hasierako pieza bat elikatu.
- Motorra eta elektronika oinarri itxi batean, sareta-gelaxka batzuen azpian edo alboan.
- Kolpe eta bibrazioek zirkuitua ez mugitzeko, finkatze-interfazearen (2.5) mende dago.

**Faseak:** (1) kanika bakarreko torloju-probeta, motorrik gabe; (2) motorra eta iturria; (3) sentsorea eta Arduinoa; (4) liburutegiko pieza eta simulazioan abiadura-iturri gisa; (5) begizta osoa ordubetez probatu.

**Egoera (2026-11-09):** 1. fasea eginda dago aplikazioan: igogailu-probeta bat (2 × 2 × 3, hodia eta eskuzko torlojua), kanika 25 mm-tik 125 mm-ra igotzeko. Geometria testetan egiaztatuta dago; ez da inprimatu. 2-5 faseak probeta horren emaitzaren zain daude: torlojuak kanika igotzen ez badu, motorra eta elektronika ez dira diseinatu behar.

**Erabaki gabe:** motor mota, elikadura, altuera maximoa, eta aplikazioak elektronikaren programa eman behar duen ala ez.

### 2.10 Ibilbide bereziak (12. pausoa)

**Egoera (2026-11-10):** hiru pieza-familia berri daude liburutegian ("Ibilbide bereziak"). Espiralaren eredu bera darabilte: gorputz finko bat eta ibilbide oso bat hutsune gisa (`isTrack`). Geometria eta simulazioa testetan egiaztatuta daude; **ez dira inprimatu**.

| Pieza | Gorputza | Diseinua | Bolumen trinkoa |
|---|---|---|---|
| Kurba zabala (`wideCurve`, `wideCurveLow`) | 2 × 2 × 1 eta 2 × 2 × 0,5 | 75 mm-ko erradioko kurba laurdena, erdiko mailan, goitik irekia. Hormak kanikaren zentroa baino gorago daude, eta simulazioan ez da kurbatik irteten. Bi noranzkoetan erabil daiteke | 435 cm³ / 210 cm³ |
| Helize-dorrea (`helix`, `helixMirror`) | 2 × 2 × 2 | Bi bira tunelean, 9,5°-ko maldan. Sarrera goitik eta irteera behetik, biak gelaxka beraren erdian: moduluak zuzenean pilatzen dira. Lau aurpegietan 9 mm-ko zirrikituak, kanika pasatzen ikusteko | 851 cm³ |
| Begizta bertikala (`loop`) | 1 × 3 × 2 | 30 mm-ko erradioko begizta tunelean; gailurrean kale batetik bestera pasatzen da (±12,5 mm), sarrerako eta irteerako bideak ez gurutzatzeko. Alboetan 45°-ko zirrikituak. Tunel itxia denez, kanikak ez du gutxieneko abiadurarik behar sabaitik ez erortzeko: gailurrera iristeko energia besterik ez | 656 cm³ |

Horrez gain, `tunnelDrop` pieza gehitu da (erdiko mailako tuneletik beheko zulora), helize-dorreak elikatzeko.

**Simulazioa:** 60°-tik gorako norabide-aldaketa bat kolpetzat hartzen da, eta kanikak norabide berriko abiadura-osagaia baino ez du gordetzen. Horrela, helizearen sarrerako eta irteerako putzuetan erorketaren abiadura galdu egiten da. Lehendik zeuden muntaien emaitzak ez dira aldatu.

**Muga ezagunak:** begiztak, simulazioaren arabera, lau malda zuzen behar ditu aurretik (125 mm-ko jaitsiera) hiru errodadura-kasuetan pasatzeko; bi maldarekin emaitza errodaduraren araberakoa da. Balio horiek suposizioak dira 9. pausoko neurketak egin arte. Piezak astunak dira, eta "Errusiar mendia" muntaiak 12 litro inguruko bolumen trinkoa du, gehiena euskarri-blokeetan.

## 3. Estaldura

| Irudietan agertzen dena | Familia | Pausoa |
|---|---|---|
| Kubo hutsa, erdi-altuerakoa | Blokea | 2 |
| Zutabea, arkua, erdi-zilindroa, teilatua | Egiturazko formak | 2 |
| 2 eta 3 unitateko pieza luzeak, 2×2 oinarria | Tamaina parametrikoa | 2 |
| Kanal zuzena eta kurba | Kanala | 1 |
| Maldadun kanal zuzena, kurba eta uhin-profila | Maldadun kanala | 3 |
| Azpiko kanala, junturako tunela | Azpiko sekzioa | 3 |
| Hasierako inbutua eta tunel kurbatua | Inbutua | 4 |
| Bukaerako geldiunea | Geldiunea | 4 |
| Hasierako blokea (eserlekua eta irteera) | Hasierako blokea | 4 (gehigarria) |
| Maldadun kurben eta espiralaren ispilu-bertsioak | Simetrikoak | 4 (gehigarria) |
| Gurutzea eta ontzi biribila | Ontzia | 4 |
| Azpitik irekitako ganbera | Ganbera | 4 |
| Espirala | Espirala | 4 |
| Bi kanal paralelo, bi tunel, Y bidegurutzea | Kanal bikoitzak | 7 |
| Tunel makurtuak, kurba bikoitzak | Kanal bikoitzak | 7 |
| Mahai gainean etzandako arrapala luzea | Arrapala askea | 8 |
| Balantzina eta ardatz bidezko pieza mugikorrak | Mugikorrak | 8 |

## 4. Pausoak

Pauso bakoitza amaitzean aplikazioa funtzionamenduan egongo da eta GitHub-en argitaratuko da.

**Aldaketa (2026-11-09):** erabiltzaileak ezin du orain inprimatu. Beheko taulako inprimatze-proba guztiak 9. pausora atzeratu dira, eta bitartean pausoak test automatikoekin eta nabigatzailean egiaztatzen dira. Neurri guztiak parametroak direnez, azken kalibrazioak piezak birsortzea besterik ez du eskatuko. Arriskua: geometria fisikoki probatu gabe garatzen da 9. pausora arte.

| # | Pausoa | Diseinua | Aplikazioa | Egiaztapena |
|---|---|---|---|---|
| **1** | **Oinarri berria** | 2.2 ataleko mailak; sekzio motak | `PieceSpec` eredua; gaur egungo piezen migrazioa; gordetako diseinuen bihurketa | **Kalibrazio-pieza berria inprimatu** |
| **2** | **Formak eta tamainak** | Altuera erdia, luzera 1-3, 2×2; zilindroa, arkua, teilatua | Liburutegia kategoriatan; parametroen panela (forma, neurriak) | Blokeak elkarren gainean |
| **3** | **Maldak** | Kanal irekia altuera aldatuz; profil lineala eta uhina; azpiko kanala | Sekzioa eta profila aukeratzea; arrapala bat ikustea | **Maldadun pieza inprimatu**: bola berez dabil |
| **4** | **Elementu bereziak** | Inbutua, geldiunea, ontziak, ganbera, espirala | Ezaugarri-editorea (posizioa eta tamaina) | Ontzia eta inbutua inprimatu |
| **5** | **Inprimaketa-irteera** | Orientazio automatikoa, bi zatiko banaketa, pinak, txaflanak, ID grabatua | ZIP esportazioa, JSON gorde/kargatu | Hegal-testa pieza guztientzat |
| **6** | **Pistaren editorea** | Zelda anitzeko piezak, 25 mm-ko Z saretan | 3D sareta, bidearen egiaztapena, kubo-zerrenda automatikoa | **Pista txiki bat muntatu** |
| **7** | **Kanal bikoitzak** | Erditik ±12,5 mm-ra dauden kaleak; Y bidegurutzea; tunel makurtuak | Portuei kalea gehitu; editorean bi kale | Bikoitz bat inprimatu |
| **8** | **Arrapala askeak eta mugikorrak** | Euskarri-koskadun arrapala makurtua; balantzina ardatzarekin (joko 0,3 mm) | Muntaia anitzeko piezak | Mugimendua probatu |
| **F** | **Finkatze-interfazea** (2.5) | Izkinetako tetoiak eta poltsak; oinarri-plaka | Aukera piezetan; plaka muntaian eta ZIPean; izkinen talka-egiaztapena | Hegal-testa; tetoi eta poltsen elkartzea testetan |
| **M4** | **Muntaia-galeria** ([PLAN-3](PLAN-3-muntaketa-simulazioa.md), 4.4) | 20 muntaia prest, dauden piezekin | Galeria Muntaketa fitxan: kargatu, simulatu, ZIP-a | Muntaia bakoitzak egiaztapenak eta simulazioa gainditzen ditu |
| **9** | **Kalibrazioa eta inprimatze-probak** | Kalibrazio-pieza eta aurreko pausoetako probak; plaka txiki bat eta bi kubo, 0,1 / 0,2 / 0,3 mm-ko jokoekin; kolpe-proba altzairuzko kanikarekin; parametroak doitu | Parametroen azken balioak | Pista bat fisikoki dabil |
| **G** | **Galeria zabaldua eta sareta handiagoa** | 20 × 20 gelaxka; uhin-malda albotik ere uhintsua | 12 eraikuntza landu gehiago ([PLAN-3](PLAN-3-muntaketa-simulazioa.md), 4.4) | Muntaia bakoitzak testak gainditzen ditu |
| **G2** | **Altuera-blokeak** | 1×2, 1×3, 1×4 eta 2×1, 2×2, 2×3, 2×4 (zabalera × altuera, kubotan) | Liburutegian; galeriako euskarriak bloke handiekin biltzen dira | Pieza-kopurua murriztea testetan |
| **10** | **Kanika-bultzagailua** (2.8) | Penduluzko bultzagailua; lehenik horizontala, gero igoera | Pieza mugikorra liburutegian; simulazioan abiadura-iturri gisa | Igoera neurtu altzairuz eta beiraz |

**8. pausoan erabakitakoa (2026-11-09):** arrapala askeak 1:2 maldakoak dira, ertza 25 mm-ko saretan geratzeko (2 unitate, 75 mm-ko altuera; 3 unitate, 100 mm-ko altuera). Etzanda inprimatzen dira, eta ez dute kanalean geruza-eskailerarik. Balantzina goitik erortzen den kanika jasotzen duen bi noranzkoko etengailua da (1 × 3 × 1); oinarria eta besoa bereizita inprimatzen dira, eta 1,75 mm-ko filamentua da ardatza. Simulazioan bide finko bat da: besoaren mugimendua ez da kalkulatzen, eta txandakatzea ez dago simulatuta.

**9. pausoaren egoera (2026-11-09):** proba-kita, Kalibrazioa fitxa eta [KALIBRAZIOA.md](KALIBRAZIOA.md) gida prest daude. Inprimatze-probak eta S5 erabiltzailearen inprimagailuaren zain daude.

**10. pausoaren egoera (2026-11-09):** penduluzko bultzagailua eta igoera-pieza eginda daude: besoa 1 × 2 × 2 markoan, 1,75 mm-ko filamentuzko ardatzarekin, eta buruan pisua gehitzeko poltsa batekin. Kolpe-gainazal metalikoa zuzenean itsatsi daiteke (M6 zirrindola, adibidez). Simulazioan abiadura finko bat da (800 mm/s, suposizioa, Kalibrazioa fitxan aldagarria). Ez dago probatuta: igoera neurtzea 9. pausoaren zain dago.

Azken pausoa **11. Kanika-igogailua** da (2.9): 9. eta 10. pausoen ondoren.

**Pieza mugikorren berrikuspena (2026-11-10):** lau piezak erabilerari begira birdiseinatu dira. Aldaketa guztiak testetan egiaztatuta daude (talka, jokoa, hegalak), baina **ez dira inprimatu**: neurriak 9. pausoko proben zain daude.

| Pieza | Aldaketa | Erosi beharreko osagaiak |
|---|---|---|
| Balantzina | Besoaren erdian banatzaile bat: beti alde baxurantz makurtzen da (5,7 mm), eta kanika alde altuan erortzen da; bere pisuak besoa iraultzen du. Txandakatzaile automatikoa da orain. Gorputza 75 mm-ko altuerakoa da (1 × 3 × 1,5), kanika goiko zulotik atera ondoren desbideratu ahal izateko | Pina ISO 2338 Ø3 × 50 |
| Bultzagailua | Aurreko zubia (bi hormak lotzen ditu eta kolpearen ondoren besoa gelditzen du); palanka besoaren gainean; topea 75°-tan; armatze-pin inprimatua 70°-tan; kanika sartzeko zuloa; kolpe-punta altzairuzkoa | Pina ISO 2338 Ø3 × 50; 2 azkoin ISO 4032 M12; torlojua ISO 7380 M5 × 10 |
| Igoera | Profil leundua (tangente horizontala bi muturretan) eta 2 gelaxkako bertsioa (`rampClimbLong`) | — |
| Igogailua | Kanikaren zentroa zuloaren hormatik 3 mm kanpora doa, arteka sakon batean; hariaren ertzak eramaten du eta kanporantz bultzatzen du; nukleoak (Ø64) ez dio barrurantz irteten uzten. Torlojuaren hondoa kanikaren eserlekua baino 3,5 mm beherago hasten da, haria kanikaren azpitik sar dadin. Leihoak lau aurpegietan. Goiko heldulekua ildaskatua, hatzarentzako sakonunearekin eta motorrerako hexagono-ahoarekin (10 mm) | Pina ISO 2338 Ø3 × 16; zirrindola ISO 7089 M3 |

Ardatz guztiak Ø3 mm-ko altzairuzko pinak dira orain (`axleDiameter`); 1,75 mm-ko filamentua bi zatiko piezen lerrokatze-pinetarako bakarrik geratzen da. Aplikazioak "Xehetasunak" atala erakusten du pieza hauetan (zatiak, osagaiak, muntaketa, erabilera eta bista lehertua), eta osagai-zerrenda ZIP esportazioetan sartzen da (`README.txt` piezan, `hardware.txt` muntaian).

**Motorizazioa (erabakia, 2026-11-10):** motorra goitik lotuko da, ez oinarritik. Arrazoia: igogailuaren azpiko oinarri-modulu batek sarrera 50 mm igoko luke, eta lurreko pistekin bateraezina litzateke. Aurreikusitakoa: N20 motor erreduktoreduna (6 V, 60 rpm inguru, suposizioa) hodiaren gaineko estalki batean, torlojuaren goiko hexagono-ahoari lotuta. Estalkia eta egokitzailea diseinatu gabe daude.

**Muga ezagunak:** balantzinaren txandakatzea eta igogailua ez daude simulatuta; igogailuaren hodia eta torlojua astunak dira (250 g eta 140 g inguru, estimazioa); beirazko kanikak (5,4 g) balantzina iraultzeko duen tartea txikia da.

Pistaren editorea (6) kanal bikoitzen aurretik doa, proiektuaren helburu nagusia delako eta bikoitzak gero portu-eredua zabalduz gehitzen direlako. Bikoitzek ez dute 1. pausoko eredua aldatzen behartuko, portuek hasieratik `lane` eremua izango dutelako (0 balioarekin).

## 5. Inprimaketa-arazoak

| Pieza | Arazoa | Konponbidea |
|---|---|---|
| Azpiko kanala | Sabaia ohean | Malko-sekzioa, tunelen modu berean |
| Azpitik irekitako ganbera | Sabaia euskarririk gabe | Bi zatitan edo euskarriekin |
| Arkua | Barneko hegala | Saihets baten gainean inprimatu |
| 2-3 unitateko piezak | Deformazioa | PLA eta brim-a erabili; lehen geruzaren itsaspena probatu |
| Pieza mugikorrak | Ardatzaren jokoa | 0,3 mm parametroa eta proba-inprimaketa |

## 6. Arriskuak

| Arriskua | Eragina | Arintzea |
|---|---|---|
| Kanal azalekoa (8,5 mm) kurbetan | Bola irteten da | 1. pausoko proba; sakonera parametroa |
| Neurri guztiak irudietatik ondorioztatuta | Doikuntza falta | Parametroak; inprimatze-puntuak |
| Geruzak malda txikietan | Bola geldi daiteke | Malda minimoa parametroa |
| Editorea konplexuegi bihurtzea | Erabilera zaila | Pieza prestatuak lehenetsita; parametroak aukerako panelean |

## 7. Onartu beharrekoa

1. 2.2 ataleko 0/25/50 mm-ko mailak.
2. 4. ataleko pausoen ordena.
3. 2.4 ataleko irizpidea.
