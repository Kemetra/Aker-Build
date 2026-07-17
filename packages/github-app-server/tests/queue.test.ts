import { describe, expect, it } from "vitest";
import { BoundedJobQueue, type DeliveryJob } from "../src/queue.js";

function job(id: number): DeliveryJob {
  return {
    event: {
      owner: "org",
      repo: "repo",
      prNumber: id,
      baseSha: (id + 1).toString(16).padStart(40, "0"),
      headSha: id.toString(16).padStart(40, "0"),
      isDraft: false,
      installationId: 99,
    },
    checkId: id,
    deliveryHash: `delivery-${id}`,
  };
}

describe("BoundedJobQueue", () => {
  it("does not execute a committed job before explicit activation", async () => {
    const ran: number[] = [];
    const queue = new BoundedJobQueue({
      concurrency: 1,
      maxWaiting: 1,
      execute: async (item) => {
        ran.push(item.checkId);
      },
    });
    const reservation = queue.reserve();
    expect(reservation).not.toBeNull();
    const activate = reservation!.commit(job(1));
    await Promise.resolve();
    expect(ran).toEqual([]);
    activate();
    await queue.onIdle();
    expect(ran).toEqual([1]);
  });

  it("never exceeds concurrency and bounds active + waiting + reserved capacity", async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const queue = new BoundedJobQueue({
      concurrency: 2,
      maxWaiting: 1,
      execute: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
      },
    });

    const reservations = [queue.reserve(), queue.reserve(), queue.reserve()];
    expect(reservations.every(Boolean)).toBe(true);
    expect(queue.reserve()).toBeNull();
    reservations.forEach((reservation, index) => reservation!.commit(job(index + 1))());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(queue.stats()).toMatchObject({ active: 2, waiting: 1, reserved: 0 });
    expect(peak).toBe(2);
    releases.splice(0).forEach((release) => release());
    await new Promise((resolve) => setTimeout(resolve, 0));
    releases.splice(0).forEach((release) => release());
    await queue.onIdle();
    expect(peak).toBe(2);
  });

  it("a released reservation restores capacity", () => {
    const queue = new BoundedJobQueue({ concurrency: 1, maxWaiting: 0, execute: async () => {} });
    const reservation = queue.reserve();
    expect(reservation).not.toBeNull();
    expect(queue.reserve()).toBeNull();
    reservation!.release();
    expect(queue.reserve()).not.toBeNull();
  });
});
