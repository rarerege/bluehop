import {
  BER_SIM_POINTS,
  setupHistogram,
  simulatedCollisionPct,
  simulatedThroughputKbps,
  simulatedWifiLossPct,
  type Histogram,
} from '../sim/experiments';
import { ACL_TYPES, type AclType } from '../sim/packets';

/** Jobs Lab Mode can run (in a Web Worker, or inline as a fallback). */
export type LabJob =
  | { kind: 'throughput'; slots: number; seed: number }
  | { kind: 'collision'; slots: number; nMax: number; seed: number }
  | { kind: 'wifi'; slots: number; seed: number }
  | { kind: 'setup'; n: number; seed: number };

export interface ThroughputResult {
  kind: 'throughput';
  points: { type: AclType; ber: number; kbps: number }[];
}
export interface CollisionResult {
  kind: 'collision';
  points: { n: number; pct: number }[];
}
export interface WifiResult {
  kind: 'wifi';
  points: { duty: number; off: number; on: number }[];
}
export interface SetupResult {
  kind: 'setup';
  hist: Histogram;
}
export type LabResult = ThroughputResult | CollisionResult | WifiResult | SetupResult;

export const WIFI_DUTIES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

/** Run a job, reporting progress 0…1. Shared by the worker and the inline fallback. */
export function runJob(job: LabJob, progress: (p: number) => void): LabResult {
  switch (job.kind) {
    case 'throughput': {
      const points: ThroughputResult['points'] = [];
      const total = ACL_TYPES.length * BER_SIM_POINTS.length;
      let i = 0;
      for (const type of ACL_TYPES) {
        for (const ber of BER_SIM_POINTS) {
          points.push({ type, ber, kbps: simulatedThroughputKbps(type, ber, job.slots, job.seed + i) });
          progress(++i / total);
        }
      }
      return { kind: 'throughput', points };
    }
    case 'collision': {
      const points: CollisionResult['points'] = [];
      for (let n = 1; n <= job.nMax; n++) {
        points.push({ n, pct: simulatedCollisionPct(n, job.slots, job.seed + n) });
        progress(n / job.nMax);
      }
      return { kind: 'collision', points };
    }
    case 'wifi': {
      const points: WifiResult['points'] = [];
      WIFI_DUTIES.forEach((duty, i) => {
        points.push({
          duty,
          off: simulatedWifiLossPct(duty, false, job.slots, job.seed + i),
          on: simulatedWifiLossPct(duty, true, job.slots, job.seed + i),
        });
        progress((i + 1) / WIFI_DUTIES.length);
      });
      return { kind: 'wifi', points };
    }
    case 'setup':
      progress(1);
      return { kind: 'setup', hist: setupHistogram(job.n, job.seed) };
  }
}

export type WorkerIn = { id: number; job: LabJob };
export type WorkerOut = { id: number; type: 'progress'; p: number } | { id: number; type: 'done'; result: LabResult } | { id: number; type: 'error'; message: string };
