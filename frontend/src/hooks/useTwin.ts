import { useSyncExternalStore } from 'react';
import { getVersion, subscribe } from '../store/twinStore';

/** Berlangganan perubahan twin; mengembalikan nomor versi yang naik tiap kali keadaan berubah. */
export function useTwin() {
  return useSyncExternalStore(subscribe, getVersion);
}
