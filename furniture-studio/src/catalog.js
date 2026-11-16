// Full catalogue: base types + extended sets, grouped into categories.
import { TYPES as BASE } from './types.js';
import { TYPES2 } from './types2.js';
import { TYPES3 } from './types3.js';

export const CATEGORIES = [
  { id: 'duduk', label: 'Kursi & Sofa' },
  { id: 'meja', label: 'Meja' },
  { id: 'kamar', label: 'Kamar tidur' },
  { id: 'simpan', label: 'Rak & Penyimpanan' },
  { id: 'dapur', label: 'Dapur' },
  { id: 'mandi', label: 'Kamar mandi' },
  { id: 'dekor', label: 'Lampu & Dekor' },
  { id: 'alat', label: 'Elektronik' },
  { id: 'luar', label: 'Taman & Outdoor' },
];

// display order inside each category
const ORDER = [
  'kursi', 'kursiSantai', 'sofa', 'kursiKantor', 'kursiGoyang', 'kursiLipat', 'bangku', 'bangkuPanjang', 'ottoman', 'beanbag',
  'mejaMakan', 'mejaKopi', 'mejaSamping', 'mejaKerja', 'mejaKonsol', 'mejaBar', 'mejaNesting',
  'tempatTidur', 'ranjangSusun', 'boksBayi', 'lemari', 'lemariLaci', 'nakas', 'mejaRias',
  'rakBuku', 'rakDinding', 'rakKubus', 'rakSepatu', 'lemariKaca', 'mejaTV', 'lemariArsip',
  'dapur', 'pulauDapur', 'kulkas', 'kompor', 'microwave', 'dispenser', 'rakPiring',
  'wastafel', 'toilet', 'bathtub', 'rakHanduk', 'lemariCermin',
  'lampuLantai', 'lampuMeja', 'lampuGantung', 'cermin', 'pot', 'jamDinding', 'gantunganBaju', 'karpet', 'lukisan',
  'tv', 'ac', 'kipas', 'mesinCuci', 'speaker', 'komputer',
  'kursiJemur', 'payung', 'mejaPiknik', 'ayunan',
];
const ALL = { ...BASE, ...TYPES2, ...TYPES3 };
ALL.dapur = { ...ALL.dapur, cat: 'dapur' };
ALL.kulkas = { ...ALL.kulkas, cat: 'dapur' };
export const TYPES = Object.fromEntries([...ORDER.filter((k) => ALL[k]), ...Object.keys(ALL).filter((k) => !ORDER.includes(k))].map((k) => [k, ALL[k]]));

export function defaults(type) {
  const o = {};
  for (const g of TYPES[type].schema) for (const p of g.params) o[p.k] = p.v;
  return o;
}
export const allParams = (type) => TYPES[type].schema.flatMap((g) => g.params);
