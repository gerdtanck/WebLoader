# Machinedrum WebLoader

Webseite für MDS User Machines auf **MDX X.20**. Bibliothek mit
71 Machines, PNG-Beschreibungen, Slotansicht und Laden über WebMIDI.
Alles zu diesem Unterprojekt liegt in diesem Ordner. Die Original-Machines
werden beim Laden nicht verändert.

## Online

**https://gerdtanck.github.io/WebLoader/**

Die Webseite läuft vollständig im Browser. MIDI-Zugriff und Backups bleiben
auf dem jeweiligen Gerät; GitHub Pages liefert die statischen Dateien.

## Lokal starten

Node.js ab 22.18 und Desktop Chrome oder Edge verwenden. Die Abhängigkeiten
sind auf diesem Rechner bereits installiert.

1. `start.cmd` doppelklicken oder im WebLoader-Ordner `npm run dev` ausführen.
2. Im Browser **http://127.0.0.1:5173/** öffnen.
3. Mit **Ohne Gerät ausprobieren** lässt sich der gesamte Ablauf simulieren.

Nach einem frischen Checkout zuerst `npm ci` im WebLoader-Ordner ausführen.
Die HTML-Datei nicht per `file://` öffnen: WebMIDI benötigt localhost oder
HTTPS. Das Terminal mit dem Webserver bleibt während der Nutzung geöffnet;
zum Beenden Strg+C drücken.

## Bedienung auf dem Smartphone

Die schmale Ansicht ist für Touch-Bedienung ausgelegt. Unten bleiben die
Bereiche **Bibliothek**, **Slots** und **Laden** erreichbar.

1. In der Bibliothek suchen oder filtern und eine Machine antippen.
2. In der Detailansicht die PNG-Beschreibung öffnen oder **Zielslot wählen**
   drücken. Zurück zur Bibliothek erhält Suchfilter und Scrollposition.
3. Einen großen Slot im zweispaltigen Raster antippen. Die Übersicht zeigt,
   ob er frei ist oder welche vorhandene Machine ersetzt würde.
4. **Auftrag vormerken** drücken, dann unter **Laden** die Übertragung starten.

Antippen und Vormerken senden noch keine Machine an das Gerät. Drag & Drop
bleibt auf dem Desktop verfügbar; auf dem Smartphone ist es nicht nötig.
Wichtige Touch-Flächen sind mindestens 44 × 44 CSS-Pixel groß. Die Bedienung
wurde mit simulierten Touch-Ereignissen im Desktop-Browser geprüft; ein Test
auf einem physischen Smartphone steht aus. Der lokale Link `127.0.0.1` gilt
weiterhin nur auf dem Rechner, auf dem der Webserver läuft.

## Mit der Machinedrum arbeiten

1. MIDI IN und OUT verbinden. Andere Programme, die dieselben Ports verwenden,
   vorher schließen. **MIDI verbinden → MIDI-Zugriff erlauben** wählen und
   MIDI einschließlich SysEx im Browser freigeben.
2. Ein- und Ausgang wählen. Für die hier untersuchte MKI UW+ mit X.20 C das
   vorausgewählte Geräteprofil verwenden. Das Profil ist eine Nutzerangabe;
   die gelesene Identity `X20` unterscheidet Modell und Unterrevision nicht.
3. **Verbinden und einlesen** liest U01–U16 der aktuell am Gerät ausgewählten
   Machine Bank. Nach einem Bankwechsel am Gerät erneut **Aktualisieren**.
4. Eine Machine auf einen Slot ziehen. Alternativ rechts den Zielslot wählen
   und **Zum Laden vormerken** drücken. Der Auftrag zeigt, was ersetzt wird.
5. **Machines laden** startet die vorgemerkten Aufträge nacheinander.
   Die MD währenddessen nicht bedienen und keine Bank wechseln. Für die
   Empfangsvorbereitung muss Enhanced GUI verfügbar sein; der Loader sendet
   vier NO-Tastendrücke, um einen offenen MACHINE MGR zu verlassen.

Vor dem Senden prüft WebLoader den Zielinhalt erneut und sichert belegte Slots
sowie den aktuellen Kit-Arbeitsstand in IndexedDB. Ein vom aktuellen Kit
verwendeter Zielslot wird nicht überschrieben. Das Paket wird für den
gewählten Slot neu eingerahmt; seine MDS-Nutzdaten bleiben bytegleich.

**Geladen** erscheint nach dem finalen Commit-ACK der Machinedrum. Es folgt
kein automatisches Rücklesen oder Vergleichen. Die Slotanzeige übernimmt die
Metadaten der gesendeten Machine und kennzeichnet das Commit-ACK als Quelle.
Bei **Commit nicht bestätigt** zuerst den Zielslot über **Aktualisieren** neu
einlesen; nicht blind erneut senden. Abbrechen macht einen bereits erfolgten
Commit nicht rückgängig.

Unter **Backups** lassen sich Sicherungen herunterladen. Diese sind an den
jeweiligen Browser und die Website-Adresse gebunden; ein Browser-Reset kann
sie löschen. Das **Transferprotokoll** exportiert Status, Aufträge und SysEx-
Trace als JSON. Demo-Daten landen nicht in den echten Backups.

## Grenzen von Version 0.1

- Das Profil MKI UW+ / X.20 C interpretiert **nur** passende Dump-Request-
  Antworten mit **NAK 12, Detail 0** als leer, entsprechend Nutzerentscheidung
  und vorherigem Hardwareabgleich. Das ist eine dokumentierte Heuristik.
  Timeout und andere Fehler bedeuten nicht leer.
- Bei passendem Capability-NAK 15, Detail 0 gelten konservative Transferlimits.
  Der freie Speicher bleibt unbekannt. Bestätigte freie Slots sind keine
  Aussage über genügend DSP- oder Paketablageplatz.
- U17–U48 werden angezeigt, aber weder gescannt noch beschrieben. Der frühere
  Hardwaretest an U17 endete mit Timeout. 32 unbekannte Slots sind deshalb
  auch bei erfolgreichem U01–U16-Scan erwartbar.
- Die Banknummer und ein Machine-Bank-Wechsel sind nicht über MIDI belegt.
  Version 0.1 arbeitet ausschließlich in der aktuell am Gerät gewählten Bank.
- Das optionale Standardprofil aktiviert keine NAK-Heuristiken. Es ist kein
  Nachweis für weitere Modelle oder Firmwarestände; unbekannte Antworten
  stoppen den Vorgang.
- Paketintegrität ist keine DSP-Zertifizierung. Dateiversion (aus dem
  Dateinamen) und Paketversion (aus dem MDS-Header) können abweichen und werden
  getrennt angezeigt.
- **Die Browserinstallation wurde im Demomodus und mit simulierten
  Protokollfehlern geprüft. Ein echter Schreibtest über WebMIDI steht aus.**
  Die vorangegangenen Hardware-Lesebelege stammen aus Python/RtMidi.

## Bibliothek und Build

Neue Paare unter `machines/<hersteller>/name.syx` und `name.png` ablegen.
`npm run catalog` validiert alle MDS-Pakete und erstellt `catalog.json`.
Der Katalog enthält Metadaten, Inhaltskennungen, Dateihashes und Bildpfade.

```powershell
npm test
npm run build
npm run preview
```

Der fertige statische Build liegt unter **artifacts/site/**; die Vorschau
läuft auf **http://127.0.0.1:4173/**. Relative Assetpfade unterstützen einen
GitHub-Pages-Unterpfad. Nur die erzeugte Website samt Katalog und referenzierten
Machine-/PNG-Dateien wird eingepackt. Hardware-Dumps, Backups und Traces sind
kein Bestandteil des Builds.

Repository: **https://github.com/gerdtanck/WebLoader**. Jeder Push nach `main`
führt die Tests, den Build und das GitHub-Pages-Deployment aus. Die Actions
sind auf Commit-SHAs gepinnt. Herkunft der Machine-Bibliothek: [CREDITS](CREDITS.md).
Lokale Lab-Notizen und Diagnoseprogramme werden nicht mit veröffentlicht.

## Entwicklung und Nachweise

- `src/protocol.ts`: Paketformat, Prüfsummen, Inhaltskennung, Retargeting.
- `src/session.ts`: serielle MIDI-Vorgänge, Timeouts/WAIT/NAK, Backup,
  Commit-Bestätigung und Schutz vor parallelen Aufträgen.
- `src/webmidi.ts`, `src/demo.ts`: physischer bzw. simulierter MIDI-Adapter.
- `src/main.ts`, `src/style.css`: Oberfläche ohne UI-Framework.
- `tests/`: 22 Node-Tests einschließlich aller 71 Originalpakete, beschädigter
  Daten, Fremdantworten, Zeitgrenzen und fehlender/falscher finaler ACKs.
- `package-lock.json` und `toolchain.lock.json`: gepinnte Abhängigkeiten und
  Protokollquellen. Keine externen Fonts, Tracker oder Laufzeit-CDNs.
- Die lokalen Entwicklungs- und Hardwarebelege liegen im ursprünglichen
  Arbeitsordner unter `knowledge/` und `artifacts/`; sie gehören nicht zum
  öffentlichen Website-Repository.

Das lokal erhaltene `scripts/probe_hardware.py` ist ein separater, nur lesender
Lab-Diagnosepfad und wird nicht veröffentlicht.
Er benötigt die Python-Umgebung des übergeordneten Projekts; die Webseite
und deren Build benötigen dieses Lab nicht.
