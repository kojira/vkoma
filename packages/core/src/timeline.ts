import type { EasingType } from "./params";
import type { TransitionConfig } from "./utils/transition";

export type TrackType =
  | "video"
  | "image"
  | "text"
  | "audio"
  | "shape";

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  zOrder: number;
  muted: boolean;
  locked: boolean;
  visible: boolean;
  items: TrackItem[];
}

export interface Keyframe {
  time: number;
  value: unknown;
  easing: EasingType;
}

export interface TrackItem {
  id: string;
  trackId: string;
  startTime: number;
  duration: number;
  sceneConfigId?: string;
  assetId?: string;
  params: Record<string, unknown>;
  transitionIn?: TransitionConfig;
  transitionOut?: TransitionConfig;
  keyframes?: Record<string, Keyframe[]>;
  renderCode?: string;
}

export function getTimelineDuration(tracks: Track[]): number {
  return tracks.reduce((maxEndTime, track) => {
    const trackEndTime = track.items.reduce((itemMaxEndTime, item) => {
      return Math.max(itemMaxEndTime, item.startTime + item.duration);
    }, 0);

    return Math.max(maxEndTime, trackEndTime);
  }, 0);
}

export function getItemsAtTime(tracks: Track[], time: number): TrackItem[] {
  return tracks.flatMap((track) =>
    track.items.filter((item) => time >= item.startTime && time < item.startTime + item.duration),
  );
}
