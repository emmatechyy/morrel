import "server-only";
import { gate, type GatedMemory, type ListFilter, type Memory, type MemoryEvent, type MemoryStatus, type Run } from "@morrel/core";
import demo from "@/demo/demo.json";

type Source = { source: "mock" | "real" };
interface DemoData {
  exportedAt: string;
  memories: (Memory & Source)[];
  runs: (Run & Source)[];
  events: (MemoryEvent & Source)[];
  raw: Record<string, string[]>;
}

const ORDER: Record<MemoryStatus, number> = { failed: 0, stale: 1, unverified: 2, verified: 3, retired: 4 };

/** Read-only store over the bundled demo export (MORREL_DEMO=1). Same read API the pages use. */
export class DemoStore {
  private memories: Memory[];
  private runs: Run[];
  private events: MemoryEvent[];
  readonly raw: Record<string, string[]>;

  constructor(data: DemoData = demo as unknown as DemoData) {
    // Keep mock seed data relative to "now"; real Kane runs keep their true timestamps.
    const delta = Date.now() - Date.parse(data.exportedAt);
    const sh = (iso: string | null, src: string) => (iso && src === "mock" ? new Date(Date.parse(iso) + delta).toISOString() : iso);
    this.memories = data.memories.map((m) => ({
      ...m,
      createdAt: sh(m.createdAt, m.source)!,
      updatedAt: sh(m.updatedAt, m.source)!,
      lastVerifiedAt: sh(m.lastVerifiedAt, m.source),
      retiredAt: sh(m.retiredAt, m.source),
    }));
    this.runs = data.runs
      .map((r) => ({ ...r, startedAt: sh(r.startedAt, r.source)!, finishedAt: sh(r.finishedAt, r.source) }))
      .sort((a, b) => (b.startedAt > a.startedAt ? 1 : -1));
    this.events = data.events.map((e) => ({ ...e, createdAt: sh(e.createdAt, e.source)! })).sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : b.id - a.id));
    this.raw = data.raw;
  }

  findMemory(idOrKey: string): Memory | null {
    return this.memories.find((m) => m.id === idOrKey || m.key === idOrKey) ?? null;
  }

  getRun(id: string): Run | null {
    return this.runs.find((r) => r.id === id) ?? null;
  }

  getMemory(idOrKey: string): GatedMemory {
    const m = this.findMemory(idOrKey);
    if (!m) throw new Error(`memory "${idOrKey}" not found`);
    return gate(m, m.lastRunId ? this.getRun(m.lastRunId) : null, false);
  }

  listMemories(filter: ListFilter = {}): Memory[] {
    const statuses = filter.status ? (Array.isArray(filter.status) ? filter.status : [filter.status]) : null;
    const q = filter.search?.toLowerCase();
    return this.memories
      .filter((m) => (statuses ? statuses.includes(m.status) : filter.includeRetired || m.status !== "retired"))
      .filter((m) => !q || [m.key, m.claim, m.flow.objective ?? ""].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (b.updatedAt > a.updatedAt ? 1 : -1));
  }

  listGated(filter: ListFilter = {}): GatedMemory[] {
    return this.listMemories(filter).map((m) => gate(m, m.lastRunId ? this.getRun(m.lastRunId) : null, false));
  }

  counts(): Record<MemoryStatus, number> & { total: number } {
    const out = { verified: 0, failed: 0, stale: 0, unverified: 0, retired: 0, total: 0 };
    for (const m of this.memories) {
      out[m.status]++;
      if (m.status !== "retired") out.total++;
    }
    return out;
  }

  listRuns(opts: { memoryId?: string; limit?: number } = {}): Run[] {
    return this.runs.filter((r) => !opts.memoryId || r.memoryId === opts.memoryId).slice(0, opts.limit ?? 200);
  }

  listEvents(memoryId: string): MemoryEvent[] {
    return this.events.filter((e) => e.memoryId === memoryId);
  }

  close(): void {}
}
