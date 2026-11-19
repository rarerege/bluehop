/**
 * Web Worker that runs Lab Mode simulations off the main thread, so the page
 * (and the projector demo) stays smooth while hundreds of thousands of slots
 * are simulated.
 */
import { runJob, type WorkerIn, type WorkerOut } from './protocol';

const ctx = self as unknown as { postMessage(m: WorkerOut): void; onmessage: ((e: MessageEvent<WorkerIn>) => void) | null };

ctx.onmessage = (e) => {
  const { id, job } = e.data;
  let last = 0;
  try {
    const result = runJob(job, (p) => {
      // Throttle progress messages to ~50 per job.
      if (p - last >= 0.02 || p >= 1) {
        last = p;
        ctx.postMessage({ id, type: 'progress', p });
      }
    });
    ctx.postMessage({ id, type: 'done', result });
  } catch (err) {
    ctx.postMessage({ id, type: 'error', message: String((err as Error)?.message ?? err) });
  }
};
