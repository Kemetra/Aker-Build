import type { PullRequestEvent } from "@aker-build/github-app";

export interface DeliveryJob {
  event: PullRequestEvent;
  checkId: number;
  deliveryHash: string;
}

export interface QueueStats {
  active: number;
  waiting: number;
  reserved: number;
  accepting: boolean;
}

export interface QueueReservation {
  commit(job: DeliveryJob): () => void;
  release(): void;
}

interface WaitingJob {
  job: DeliveryJob;
  activated: boolean;
}

export class BoundedJobQueue {
  readonly #concurrency: number;
  readonly #maxWaiting: number;
  readonly #execute: (job: DeliveryJob) => Promise<unknown>;
  readonly #waiting: WaitingJob[] = [];
  readonly #idleWaiters = new Set<() => void>();
  #active = 0;
  #reserved = 0;
  #accepting = true;

  constructor(args: {
    concurrency: number;
    maxWaiting: number;
    execute: (job: DeliveryJob) => Promise<unknown>;
  }) {
    this.#concurrency = args.concurrency;
    this.#maxWaiting = args.maxWaiting;
    this.#execute = args.execute;
  }

  reserve(): QueueReservation | null {
    if (!this.#accepting) return null;
    const capacity = this.#concurrency + this.#maxWaiting;
    if (this.#active + this.#waiting.length + this.#reserved >= capacity) return null;
    this.#reserved += 1;
    let state: "reserved" | "committed" | "released" = "reserved";

    return {
      commit: (job) => {
        if (state !== "reserved") throw new Error("queue reservation is no longer active");
        state = "committed";
        this.#reserved -= 1;
        const waiting: WaitingJob = { job, activated: false };
        this.#waiting.push(waiting);
        let activated = false;
        return () => {
          if (activated) return;
          activated = true;
          waiting.activated = true;
          this.#drain();
        };
      },
      release: () => {
        if (state !== "reserved") return;
        state = "released";
        this.#reserved -= 1;
        this.#notifyIdle();
      },
    };
  }

  stats(): QueueStats {
    return {
      active: this.#active,
      waiting: this.#waiting.length,
      reserved: this.#reserved,
      accepting: this.#accepting,
    };
  }

  isReady(): boolean {
    const capacity = this.#concurrency + this.#maxWaiting;
    return this.#accepting && this.#active + this.#waiting.length + this.#reserved < capacity;
  }

  stopAccepting(): void {
    this.#accepting = false;
  }

  onIdle(): Promise<void> {
    if (this.#active === 0 && this.#waiting.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.#idleWaiters.add(resolve));
  }

  #drain(): void {
    while (this.#active < this.#concurrency) {
      const index = this.#waiting.findIndex((item) => item.activated);
      if (index < 0) break;
      const [item] = this.#waiting.splice(index, 1);
      if (!item) break;
      this.#active += 1;
      void this.#execute(item.job)
        .catch(() => undefined)
        .finally(() => {
          this.#active -= 1;
          this.#drain();
          this.#notifyIdle();
        });
    }
  }

  #notifyIdle(): void {
    if (this.#active !== 0 || this.#waiting.length !== 0) return;
    for (const resolve of this.#idleWaiters) resolve();
    this.#idleWaiters.clear();
  }
}
