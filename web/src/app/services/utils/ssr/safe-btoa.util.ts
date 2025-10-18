/**
 * Encode/decode base64 in a way that survives SSR and browser contexts.
 */
export function safeBtoa(input: string): string {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window.btoa(input);
  }
  const bufferCtor = (globalThis as any).Buffer as { from: (value: string | ArrayBuffer, encoding?: string) => { toString: (encoding: string) => string } } | undefined;
  if (bufferCtor && typeof bufferCtor.from === 'function') {
    return bufferCtor.from(input, 'binary').toString('base64');
  }
  const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : undefined;
  const bytes = encoder ? encoder.encode(input) : stringToByteArray(input);
  return byteArrayToBase64(bytes);
}

export function safeAtob(input: string): string {
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    return window.atob(input);
  }
  const bufferCtor = (globalThis as any).Buffer as { from: (value: string, encoding: string) => { toString: (encoding: string) => string } } | undefined;
  if (bufferCtor && typeof bufferCtor.from === 'function') {
    return bufferCtor.from(input, 'base64').toString('binary');
  }
  const bytes = base64ToByteArray(input);
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  return byteArrayToString(bytes);
}

function stringToByteArray(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    bytes[i] = value.charCodeAt(i) & 0xff;
  }
  return bytes;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function byteArrayToBase64(bytes: Uint8Array): string {
  let result = '';
  let i = 0;

  while (i < bytes.length) {
    const byte1 = bytes[i++];
    const byte2 = i < bytes.length ? bytes[i++] : NaN;
    const byte3 = i < bytes.length ? bytes[i++] : NaN;

    const enc1 = byte1 >> 2;
    const enc2 = ((byte1 & 3) << 4) | (isNaN(byte2) ? 0 : byte2 >> 4);
    let enc3 = isNaN(byte2) ? 64 : ((byte2 & 15) << 2) | (isNaN(byte3) ? 0 : byte3 >> 6);
    let enc4 = isNaN(byte3) ? 64 : byte3 & 63;

    if (isNaN(byte2)) {
      enc3 = 64;
      enc4 = 64;
    } else if (isNaN(byte3)) {
      enc4 = 64;
    }

    result +=
      BASE64_ALPHABET.charAt(enc1) +
      BASE64_ALPHABET.charAt(enc2) +
      BASE64_ALPHABET.charAt(enc3) +
      BASE64_ALPHABET.charAt(enc4);
  }

  return result;
}

function base64ToByteArray(base64: string): Uint8Array {
  let clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const outputLength = Math.floor((clean.length * 3) / 4);
  const output = new Uint8Array(outputLength);

  let outputIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const enc1 = BASE64_ALPHABET.indexOf(clean.charAt(i));
    const enc2 = BASE64_ALPHABET.indexOf(clean.charAt(i + 1));
    const enc3 = BASE64_ALPHABET.indexOf(clean.charAt(i + 2));
    const enc4 = BASE64_ALPHABET.indexOf(clean.charAt(i + 3));

    const byte1 = (enc1 << 2) | (enc2 >> 4);
    const byte2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const byte3 = ((enc3 & 3) << 6) | enc4;

    output[outputIndex++] = byte1;
    if (enc3 !== 64 && outputIndex < output.length) {
      output[outputIndex++] = byte2;
    }
    if (enc4 !== 64 && outputIndex < output.length) {
      output[outputIndex++] = byte3;
    }
  }

  return output;
}

function byteArrayToString(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return decodeURIComponent(escape(result));
}
