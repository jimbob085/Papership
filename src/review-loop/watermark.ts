import { MappingStore } from "../store/mappingStore";

export function getWatermark(store: MappingStore): string {
  return (store as any).data.reviewLoopWatermark
    ?? new Date(Date.now() - 5 * 60 * 1000).toISOString();
}

export function setWatermark(store: MappingStore, timestamp: string): void {
  (store as any).data.reviewLoopWatermark = timestamp;
  (store as any).save();
}
