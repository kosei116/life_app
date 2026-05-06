import type { Event } from '@life-app/types';

export interface LaneAssignment {
  event: Event;
  laneIndex: number;
  laneCount: number;
}

export function assignLanes(events: Event[]): LaneAssignment[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );

  interface Cluster {
    items: { event: Event; lane: number; endMs: number }[];
    laneEnds: number[];
  }
  const clusters: Cluster[] = [];
  let current: Cluster | null = null;

  for (const ev of sorted) {
    const startMs = new Date(ev.start_at).getTime();
    const endMs = new Date(ev.end_at).getTime();

    if (!current || startMs >= Math.max(...current.laneEnds)) {
      current = { items: [], laneEnds: [] };
      clusters.push(current);
    }

    let lane = current.laneEnds.findIndex((end) => end <= startMs);
    if (lane === -1) {
      lane = current.laneEnds.length;
      current.laneEnds.push(endMs);
    } else {
      current.laneEnds[lane] = endMs;
    }
    current.items.push({ event: ev, lane, endMs });
  }

  const result: LaneAssignment[] = [];
  for (const cluster of clusters) {
    const laneCount = cluster.laneEnds.length;
    for (const item of cluster.items) {
      result.push({ event: item.event, laneIndex: item.lane, laneCount });
    }
  }
  return result;
}
