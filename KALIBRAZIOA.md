# Kalibrazioa eta inprimatze-probak

**Data:** 2026-11-09
**Egoera:** gida eta proba-piezak prest daude. Probak ez dira oraindik egin; balio guztiak suposizioak dira horiek egin arte.

## 1. Helburua

Aplikazioaren neurriak eta simulazioaren parametroak benetako inprimagailuaren eta kaniken arabera doitzea. Proba-piezak aplikazioko **Kalibrazioa** fitxatik deskargatzen dira.

## 2. Proba-kita

| Fitxategia | Zertarako | Nola inprimatu | Bereizgarria |
|---|---|---|---|
| `bore-*.stl` (3) | Kanalen eta tunelen tamaina | Esportatu bezala, zutik, euskarririk gabe | 1, 2 edo 3 zulotxo alboan |
| `coupon-*.stl` (3) | Tetoi eta poltsen arteko jokoa (0,1 / 0,2 / 0,3 mm) | Etzanda, poltsak ohean | 1, 2 edo 3 zulotxo goian |
| `plate-1x1.stl` | Tetoiak, koupon-ak probatzeko | Etzanda | — |

## 3. Probak

### 3.1 Kanalaren tamaina

Sartu kanika xerra bakoitzeko goiko kanalean, tunelean eta azpiko kanalean. Aukeratu kanika libre mugitzen den xerrarik estuena. Erabili bere balioa `boreClearance` eremuan: fitxategi-izenak diametroa dakar, eta `boreClearance` diametro hori ken kanikaren diametroa da.

Neurtu kanika kalibre batekin eta sartu `ballDiameter` eremuan.

### 3.2 Finkatzea

Jarri koupon bakoitza plakaren gainean. Aukeratu erraz sartzen dena, baina albora mugitzen ez dena. Erabili bere jokoa `locatorClearance` eremuan.

### 3.3 Kuboen arteko doikuntza

Inprimatu bi kubo eta jarri elkarren ondoan. Estu badaude, handitu `fitClearance`; hutsune handia badago, txikitu.

### 3.4 Kolpe-proba

Inprimatu galeriako muntaia txiki bat finkatze-interfazearekin. Bota altzairuzko kanika eta begiratu piezak mugitzen diren.

### 3.5 Simulazioaren parametroak

Neurketa bakoitzean hainbat saiakera egin eta batez bestekoa hartu.

| Parametroa | Neurtzeko modua |
|---|---|
| `crr` | Kanika malda ezagun batetik bota eta kanal lauan egindako distantzia neurtu |
| `jointRetention` | Pieza bakarreko eta hainbat piezatako distantziak alderatu |
| `jumpRetention` | Jauzia duen eta ez duen pista alderatu |
| `maxLean` | Abiadura handituz, kanika kurba irekitik noiz irteten den ikusi |

Egiaztapena (S5): inprimatu galeriako muntaia bat eta alderatu benetako emaitza simulazioarekin.

## 4. Balioak sartzea

**Kalibrazioa** fitxan sartu balioak eta sakatu **Aplikatu**. Nabigatzaile honetan gordetzen dira, eta pieza berri guztiek erabiliko dituzte. Balioak errepositorioan finkatzeko, `src/geometry/config.ts` eta `src/simulation/marble.ts` fitxategiak eguneratu behar dira.

Aurretik inprimatutako piezak ez dira automatikoki aldatzen: neurri berriekin berriro inprimatu behar dira.
