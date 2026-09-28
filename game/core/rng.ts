// Детерминированный ГПСЧ (mulberry32): один seed → одна и та же карта у сервера и клиентов
export class Rng {
  s: number;
  constructor(seed: number) { this.s = seed | 0; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  int(n: number): number { return n > 0 ? this.next() % n : 0; }
}
