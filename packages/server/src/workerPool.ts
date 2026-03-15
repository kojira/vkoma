import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename_esm = fileURLToPath(import.meta.url);
const __dirname_esm = path.dirname(__filename_esm);

export const MAX_RETRIES_PER_FRAME = 1;

export class WorkerPool {
  private workerPath: string;
  private poolSize: number;
  private idle: ChildProcess[] = [];
  private busy = new Set<ChildProcess>();
  private waiters: Array<{ resolve: (w: ChildProcess) => void; reject: (err: Error) => void }> = [];
  private drained = false;
  /** Latency of the last completed task in ms (for debugging) */
  lastTaskMs = 0;

  constructor(poolSize: number) {
    this.poolSize = poolSize;
    this.workerPath = path.join(__dirname_esm, "frame-worker-persistent.ts");
  }

  private spawnWorker(): ChildProcess {
    const child = spawn("node", ["--import", "tsx/esm", this.workerPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    // If worker dies unexpectedly, remove it from all tracking and log
    child.on("exit", (code, signal) => {
      const wasBusy = this.busy.delete(child);
      const idleIdx = this.idle.indexOf(child);
      if (idleIdx !== -1) {
        this.idle.splice(idleIdx, 1);
      }
      // Only warn for unexpected crashes (non-zero exit or signal), not normal exits during drain
      if (!this.drained && (code !== 0 || signal !== null) && (wasBusy || idleIdx !== -1)) {
        console.warn(`[WorkerPool] worker pid=${child.pid} exited unexpectedly (code=${code}, signal=${signal})`);
      }
    });
    return child;
  }

  private acquire(signal?: AbortSignal): Promise<ChildProcess> {
    if (signal?.aborted) {
      return Promise.reject(new Error("Render cancelled"));
    }
    if (this.idle.length > 0) {
      const w = this.idle.pop()!;
      this.busy.add(w);
      return Promise.resolve(w);
    }
    if (this.busy.size < this.poolSize) {
      const w = this.spawnWorker();
      this.busy.add(w);
      return Promise.resolve(w);
    }
    return new Promise<ChildProcess>((resolve, reject) => {
      const waiter = { resolve, reject };
      this.waiters.push(waiter);

      if (signal) {
        const onAbort = () => {
          const idx = this.waiters.indexOf(waiter);
          if (idx !== -1) {
            this.waiters.splice(idx, 1);
          }
          reject(new Error("Render cancelled"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  }

  private release(worker: ChildProcess): void {
    this.busy.delete(worker);
    if (this.drained) {
      worker.stdin?.end();
      return;
    }
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      this.busy.add(worker);
      waiter.resolve(worker);
    } else {
      this.idle.push(worker);
    }
  }

  async run(input: object, signal?: AbortSignal, retries = MAX_RETRIES_PER_FRAME): Promise<Buffer[]> {
    if (signal?.aborted) {
      throw new Error("Render cancelled");
    }

    const worker = await this.acquire(signal);
    const t0 = Date.now();

    try {
      const result = await this._runOnWorker(worker, input, signal);
      this.lastTaskMs = Date.now() - t0;
      return result;
    } catch (err) {
      if (signal?.aborted) {
        throw new Error("Render cancelled");
      }
      if (retries > 0) {
        // Retry with a fresh worker
        return this.run(input, signal, retries - 1);
      }
      throw err;
    }
  }

  private _runOnWorker(worker: ChildProcess, input: object, signal?: AbortSignal): Promise<Buffer[]> {
    return new Promise<Buffer[]>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let stderrData = "";
      let settled = false;

      const jsonBytes = Buffer.from(JSON.stringify(input), "utf8");
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32BE(jsonBytes.length, 0);

      const cleanup = () => {
        worker.stdout?.removeListener("data", onData);
        worker.stderr?.removeListener("data", onStderr);
        worker.removeListener("error", onError);
        worker.removeListener("exit", onExit);
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
      };

      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this.busy.delete(worker);
        worker.kill("SIGKILL");
        reject(new Error("Render cancelled"));
      };

      const onData = (chunk: Buffer) => {
        chunks.push(chunk);

        // Try to parse complete frames + sentinel from accumulated data
        const raw = Buffer.concat(chunks);
        let offset = 0;
        const buffers: Buffer[] = [];

        while (offset + 4 <= raw.length) {
          const frameLen = raw.readUInt32BE(offset);
          if (frameLen === 0) {
            // Sentinel found — response complete
            settled = true;
            cleanup();
            // Keep remaining data (shouldn't be any) for next request
            this.release(worker);
            resolve(buffers);
            return;
          }
          offset += 4;
          if (offset + frameLen > raw.length) {
            // Incomplete frame, wait for more data
            break;
          }
          buffers.push(raw.subarray(offset, offset + frameLen));
          offset += frameLen;
        }
      };

      const onStderr = (chunk: Buffer) => {
        stderrData += chunk.toString();
      };

      const onError = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        // Don't release — worker is dead
        this.busy.delete(worker);
        reject(err);
      };

      const onExit = (code: number | null) => {
        if (settled) return;
        settled = true;
        cleanup();
        this.busy.delete(worker);
        reject(
          new Error(
            `Worker exited unexpectedly with code ${code}: ${stderrData.slice(-500)}`,
          ),
        );
      };

      worker.stdout?.on("data", onData);
      worker.stderr?.on("data", onStderr);
      worker.on("error", onError);
      worker.on("exit", onExit);

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }

      // Send the request: 4-byte length + JSON
      worker.stdin?.write(lenBuf);
      worker.stdin?.write(jsonBytes);
    });
  }

  async drain(): Promise<void> {
    this.drained = true;
    // Reject all pending waiters
    for (const waiter of this.waiters) {
      waiter.reject(new Error("WorkerPool is draining"));
    }
    this.waiters = [];

    const allWorkers = [...this.idle, ...this.busy];
    const exitPromises = allWorkers.map(
      (w) =>
        new Promise<void>((resolve) => {
          w.on("exit", () => resolve());
          w.stdin?.end();
          // Force kill after 5 seconds
          setTimeout(() => {
            w.kill("SIGKILL");
            resolve();
          }, 5000);
        }),
    );

    this.idle = [];
    this.busy.clear();

    await Promise.all(exitPromises);
  }
}
