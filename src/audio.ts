// Adapted from OpenClaw's MIT-licensed audio-codec and bounded audio queue.
// These host helpers are reserved for official plugins, so this independent
// package owns the small G.711 conversion and pre-connection queue it needs.
export function mulawToPcm(audio: Buffer): Buffer {
  const pcm = Buffer.alloc(audio.length * 2);
  for (let i = 0; i < audio.length; i++) {
    const value = ~audio[i] & 0xff;
    const magnitude = (((value & 0x0f) << 3) + 0x84) << ((value >> 4) & 7);
    pcm.writeInt16LE(value & 0x80 ? 0x84 - magnitude : magnitude - 0x84, i * 2);
  }
  return pcm;
}

export function createAudioQueue(onOverflow: () => void) {
  let chunks: Buffer[] = [];
  let bytes = 0;
  const clear = () => {
    chunks = [];
    bytes = 0;
  };
  return {
    clear,
    enqueue(audio: Buffer) {
      if (chunks.length >= 320 || bytes + audio.length > 1024 * 1024) {
        onOverflow();
        return false;
      }
      chunks.push(Buffer.from(audio));
      bytes += audio.length;
      return true;
    },
    drain() {
      const result = chunks;
      clear();
      return result;
    },
  };
}
