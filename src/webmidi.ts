import type { Link } from './session.ts';
export class WebMidiLink implements Link {
  input: MIDIInput; output: MIDIOutput; access: MIDIAccess;
  listeners = new Set<{ receive: (b: Uint8Array) => void; failed: (e: Error) => void }>();
  lost: () => void;
  constructor(access: MIDIAccess, input: MIDIInput, output: MIDIOutput, lost: () => void) {
    this.access = access; this.input = input; this.output = output; this.lost = lost;
    input.addEventListener('midimessage', this.message); access.addEventListener('statechange', this.state);
  }
  message = (event: MIDIMessageEvent) => { if (event.data) for (const l of this.listeners) l.receive(new Uint8Array(event.data)); };
  state = () => {
    if (this.input.state === 'disconnected' || this.output.state === 'disconnected') {
      for (const l of this.listeners) l.failed(new Error('MIDI-Verbindung unterbrochen.'));
      this.lost();
    }
  };
  send(bytes: Uint8Array) {
    if (this.input.state !== 'connected' || this.output.state !== 'connected') throw new Error('MIDI-Port nicht verbunden.');
    this.output.send(bytes);
  }
  subscribe(receive: (b: Uint8Array) => void, failed: (e: Error) => void) {
    const listener = { receive, failed }; this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  async close() { this.input.removeEventListener('midimessage', this.message); this.access.removeEventListener('statechange', this.state); await this.input.close(); await this.output.close(); }
}
