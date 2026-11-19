export function download(bytes: Uint8Array, filename: string, mime = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime })), a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 15000);
}
