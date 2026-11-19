# Machinedrum WebLoader

Browse 126 MDS User Machines, view their descriptions, and load them into
**MDX X.20** over WebMIDI.

**[Open WebLoader](https://gerdtanck.github.io/WebLoader/)**

The app runs in your browser. GitHub Pages serves the static files; MIDI
access stays on the device running the browser.

## Usage

1. Choose **Connect MIDI → Allow MIDI access**, allow SysEx, and select the
   MIDI input and output. Close other applications using those ports.
2. Select a device profile and choose **Connect and scan**. The default
   profile is for the MKI UW+ with X.20 C examined in this project.
3. Choose a machine in **Library**. On a phone, choose **Choose slot**, tap
   a slot, then **Add to queue**. On desktop, drag a machine onto a slot
   or select a target in its details.
4. Open **Transfers** and choose **Load machines**. Keep the device idle and
   leave the current bank selected during the transfer.

The PNG viewer has a fixed bottom bar on phones. **Back to library** returns
straight to the list; **Close** returns to the machine details. Browser Back
and Android Back dismiss the image first, then return to the library.
Filters and the list position are preserved. Selecting a machine or adding
it to the queue does not send it to the device.

WebLoader works with the bank selected on the Machinedrum. Use **Refresh**
after changing banks on the device. Before sending, it checks the target
contents and prevents replacing a machine used by the current kit. Enhanced
GUI must be available; the loader sends four NO key presses to leave an open
MACHINE MGR. Retargeting preserves the MDS payload bytes.

**Loaded** means the device returned the final commit ACK. There is no
automatic backup or readback comparison. If a commit is unconfirmed, refresh
the target slot before retrying. Canceling cannot undo a completed commit.
**Export transfer log** saves the current session status and SysEx trace as JSON.

## Version 0.1 limits

- U01–U16 are supported. U17–U48 remain unavailable; an earlier U17 hardware
  read timed out. The bank number and remote bank switching are unverified.
- The MKI UW+ / X.20 C profile treats matching dump-request **NAK 12, detail 0**
  as an empty slot. This is a user-approved heuristic checked against the
  observed slot contents, not a general rule for all firmware or models.
  Timeouts and other errors never mean empty.
- Matching capability **NAK 15, detail 0** enables conservative transfer
  limits in that profile. Free memory stays unknown. An empty slot does not
  guarantee enough DSP memory or package storage.
- The **Standard** profile enables neither heuristic. Identity `X20` does
  not distinguish hardware models or firmware subrevisions. Support for
  other models has not been established.
- File versions and MDS package versions may differ. Package integrity
  checks are not DSP certification.
- Responsive layouts and navigation were checked in desktop Chrome at
  phone sizes. Physical Android gesture testing and a real WebMIDI write
  test remain outstanding. Earlier hardware reads used Python/RtMidi.

## Local development

Requires Node.js 22.18 or newer. Use a browser with WebMIDI and SysEx support,
such as desktop Chrome or Edge.

```powershell
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/**. After installing dependencies, `start.cmd`
also starts the server. Keep its terminal open; stop with Ctrl+C.
WebMIDI requires HTTPS or localhost. Opening `index.html` as a file does not
work. The localhost address is accessible only on the computer running it.

```powershell
npm test
npm run build
npm run preview
```

The static build is in `artifacts/site/`; preview runs at
**http://127.0.0.1:4173/**. Relative asset paths support GitHub Pages subpaths.
Pushes to `main` run the tests, build, and Pages deployment.

## Library and sources

Add matching `name.syx` and `name.png` files under `machines/<author>/`.
`npm run catalog` validates the packages and generates `catalog.json` with
metadata, content IDs, hashes, and image paths.

The 55 original X.20-C machines by **jmamma** have generated description
images. See [image generation](machines/jmamma/README.md) and [credits](CREDITS.md).
Original machine payloads are unchanged. No firmware or ROM files are included.

- `src/protocol.ts`: package validation, checksums, content IDs, retargeting.
- `src/session.ts`, `src/webmidi.ts`: serial transfers, WAIT/NAK/timeouts and
  final commit validation. `src/demo.ts` is a test adapter only.
- `src/main.ts`, `src/navigation.ts`, CSS: interface and browser history.
- `tests/`: 27 tests covering navigation, all library packages, corrupt and
  unrelated responses, time limits, and missing or incorrect final ACKs.
- `package-lock.json`, `toolchain.lock.json`: pinned dependencies and sources.

There are no external fonts, trackers, or runtime CDNs. Local lab notes,
hardware traces, and diagnostic scripts are excluded from the public repository
and website build.
