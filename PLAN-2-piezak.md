# Pieza-familien plana

**Bertsioa:** 0.2 (onetsita; zuloen diametroa 17 mm)
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
  body: { shape: 'box' | 'cylinder' | 'halfCylinder' | 'arch' | 'roof' | 'wedge'; size: [number, number, number] };
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
| Gurutzea eta ontzi biribila | Ontzia | 4 |
| Azpitik irekitako ganbera | Ganbera | 4 |
| Espirala | Espirala | 4 |
| Bi kanal paralelo, bi tunel, Y bidegurutzea | Kanal bikoitzak | 7 |
| Tunel makurtuak, kurba bikoitzak | Kanal bikoitzak | 7 |
| Mahai gainean etzandako arrapala luzea | Arrapala askea | 8 |
| Balantzina eta ardatz bidezko pieza mugikorrak | Mugikorrak | 8 |

## 4. Pausoak

Pauso bakoitza amaitzean aplikazioa funtzionamenduan egongo da eta GitHub-en argitaratuko da. Inprimatze-puntuetan zure proba behar da.

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
