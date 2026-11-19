# jmamma — X.20-C User Machines

55 User Machines von **jmamma** aus dem vom Projektinhaber bereitgestellten
Ordner `Machinedrum_SPS1-UW_OS_X.20_C/USR-Machines`.

| Familie | Machines |
| --- | ---: |
| NFX | 9 |
| P-I | 5 |
| SYN | 9 |
| TX6 | 6 |
| TX8 | 10 |
| TX9 | 5 |
| TXZ | 11 |

Die SYX-Dateien sind bytegleiche Kopien der Originale. Jeder Datei steht
eine gleichnamige PNG gegenüber. Die PNGs wurden für WebLoader erstellt:
Kurzbeschreibung und Familienbeschreibung stammen aus der mitgelieferten
`README.txt`; Name, Version, Symbol, Parameterreihenfolge, Standardwerte und
numerische Wertebereiche stammen aus dem jeweiligen MDS-Paket.
Die Reglergrafik ist eine schematische Darstellung der Standardwerte.
Die Wertebereiche sind kodierte Parameterwerte, keine physikalischen Einheiten.
Die Quelle enthält keine ausführlichen Erklärungen zu den einzelnen Reglern.

## Bilder reproduzieren

Voraussetzungen: Node.js ab 22.18, Python mit `Pillow==12.0.0`, die im
Quellmanifest gepinnten Windows-Schriften Arial und Consolas sowie der
ursprüngliche `USR-Machines`-Ordner. Aus dem WebLoader-Ordner:

```powershell
python scripts/import_jmamma.py "PFAD/USR-Machines"
npm run build
```

Ein anderer Schriftordner kann mit `--font-dir` angegeben werden.
Das Skript prüft alle Quelldateien und Schriften gegen SHA-256-Pins in
`scripts/data/jmamma-sources.json`. Abweichende vorhandene SYX-Dateien werden
nicht überschrieben. PNGs werden reproduzierbar neu erzeugt; der Importnachweis
liegt unter `artifacts/jmamma-import/manifest.json`.

Die Paketintegrität wurde mit dem WebLoader-Parser und unabhängig mit dem
lokalen Python-MDS-Parser geprüft. Die Übernahme verändert keinen DSP-Code
und stellt keine neue DSP-Zertifizierung oder Hardwareabnahme dar.
Es sind ausschließlich User Machines enthalten, keine Firmware oder ROMs.
