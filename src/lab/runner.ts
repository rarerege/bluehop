import { runJob, type LabJob, type LabResult, type WorkerIn, type WorkerOut } from './protocol';

/**
 * Runs Lab jobs in a Web Worker (one shared worker, jobs queue in order).
 * Falls back to running inline if workers are unavailable.
 */
export class LabRunner {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (r: LabResult) => void; reject: (e: Error) => void; progress: (p: number) => void }>();

  constructor() {
    try {
      this.worker = new Worker(new URL('./lab.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<WorkerOut>) => this.onMessage(e.data);
      this.worker.onerror = () => {
        // Worker failed to load (e.g. blocked): reject everything and switch to inline.
        for (const p of this.pending.values()) p.reject(new Error('worker failed'));
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
  }

  run(job: LabJob, progress: (p: number) => void): Promise<LabResult> {
    if (!this.worker) return this.runInline(job, progress);
    const id = this.nextId++;
    return new Promise<LabResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, progress });
      const msg: WorkerIn = { id, job };
      this.worker!.postMessage(msg);
    }).catch(() => this.runInline(job, progress));
  }

  private onMessage(m: WorkerOut): void {
    const p = this.pending.get(m.id);
    if (!p) return;
    if (m.type === 'progress') p.progress(m.p);
    else if (m.type === 'done') {
      this.pending.delete(m.id);
      p.resolve(m.result);
    } else {
      this.pending.delete(m.id);
      p.reject(new Error(m.message));
    }
  }

  private runInline(job: LabJob, progress: (p: number) => void): Promise<LabResult> {
    return new Promise((resolve) => setTimeout(() => resolve(runJob(job, progress)), 0));
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
