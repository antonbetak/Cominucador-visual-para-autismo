// Gemini 3.1 produces PCM16; validate the container before caching or playback.
export function inspectWav(bytes) {
  const fail = () => { const error = new Error("Invalid PCM WAV"); error.code = "format"; throw error; };
  if (!(bytes instanceof Uint8Array) || bytes.length < 46) return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (text(0) !== "RIFF" || text(8) !== "WAVE" || view.getUint32(4, true) + 8 !== bytes.length) return fail();
  let format;
  let dataSize = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = view.getUint32(offset + 4, true);
    if (offset + 8 + size > bytes.length) return fail();
    if (text(offset) === "fmt ") {
      if (size < 16) return fail();
      const channels = view.getUint16(offset + 10, true);
      const rate = view.getUint32(offset + 12, true);
      const align = view.getUint16(offset + 20, true);
      if (view.getUint16(offset + 8, true) !== 1 || ![1, 2].includes(channels) || rate < 8000 || rate > 96000 || view.getUint16(offset + 22, true) !== 16 || align !== channels * 2 || view.getUint32(offset + 16, true) !== rate * align) return fail();
      format = { channels, rate, align };
    }
    if (text(offset) === "data") dataSize += size;
    offset += 8 + size + (size % 2);
  }
  if (!format || !dataSize || dataSize % format.align) return fail();
  return { ...format, dataSize };
}
