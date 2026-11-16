import type { Backup } from './session.ts';
let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('machinedrum-webloader', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('backups', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  });
}
export async function saveBackup(backup: Backup) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('backups', 'readwrite'); tx.objectStore('backups').put(backup);
    tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Backup konnte nicht gespeichert werden.'));
  });
}
export async function getBackups(): Promise<Backup[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction('backups').objectStore('backups').getAll();
    request.onsuccess = () => resolve((request.result as Backup[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    request.onerror = () => reject(request.error);
  });
}
export function download(bytes: Uint8Array, filename: string, mime = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime })), a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 15000);
}
