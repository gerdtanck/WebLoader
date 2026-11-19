# jmamma — X.20-C User Machines

55 User Machines by **jmamma**, supplied by the project owner in
`Machinedrum_SPS1-UW_OS_X.20_C/USR-Machines`.

| Family | Machines |
| --- | ---: |
| NFX | 9 |
| P-I | 5 |
| SYN | 9 |
| TX6 | 6 |
| TX8 | 10 |
| TX9 | 5 |
| TXZ | 11 |

The SYX files are byte-identical copies of the originals. Each has a matching
PNG generated for WebLoader. Machine and family descriptions come from the
supplied `README.txt`; names, versions, icons, parameter order, defaults, and
numeric ranges come from the MDS packages. Knob graphics show default values.
Ranges are encoded parameter values, not physical units. The source does not
include detailed explanations for each control.

## Reproduce the images

Requires Node.js 22.18 or newer, Python with `Pillow==12.0.0`, the pinned
Windows Arial and Consolas fonts, and the original `USR-Machines` directory.
Run from the WebLoader directory:

```powershell
python scripts/import_jmamma.py "PATH/USR-Machines"
npm run build
```

Use `--font-dir` to specify another font directory. The script verifies source
files and fonts against SHA-256 pins in `scripts/data/jmamma-sources.json`.
It does not overwrite differing SYX files. PNG generation is reproducible;
the import report is saved to `artifacts/jmamma-import/manifest.json`.

Package integrity was checked with the WebLoader parser and independently
with the local Python MDS parser. This import changes no DSP code and does
not constitute new DSP certification or hardware validation. Only User
Machines are included, without firmware or ROMs.
