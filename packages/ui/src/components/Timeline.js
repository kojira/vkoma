import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef } from "react";
import { useTimelineStore } from "../stores/timelineStore";
const HEADER_WIDTH = 160;
const ROW_HEIGHT = 56;
const PIXELS_PER_SECOND = 120;
const MIN_TIMELINE_SECONDS = 10;
function formatTime(seconds) {
    const safeSeconds = Math.max(0, seconds);
    const minutes = Math.floor(safeSeconds / 60)
        .toString()
        .padStart(2, "0");
    const remainder = Math.floor(safeSeconds % 60)
        .toString()
        .padStart(2, "0");
    return `${minutes}:${remainder}`;
}
function getTrackStyles(type) {
    switch (type) {
        case "video":
            return {
                block: "border-sky-400/40 bg-sky-500/25 text-sky-100",
                badge: "bg-sky-500/20 text-sky-200",
            };
        case "image":
            return {
                block: "border-emerald-400/40 bg-emerald-500/25 text-emerald-100",
                badge: "bg-emerald-500/20 text-emerald-200",
            };
        case "text":
            return {
                block: "border-amber-400/40 bg-amber-500/25 text-amber-100",
                badge: "bg-amber-500/20 text-amber-200",
            };
        case "audio":
            return {
                block: "border-fuchsia-400/40 bg-fuchsia-500/25 text-fuchsia-100",
                badge: "bg-fuchsia-500/20 text-fuchsia-200",
            };
        case "shape":
            return {
                block: "border-rose-400/40 bg-rose-500/25 text-rose-100",
                badge: "bg-rose-500/20 text-rose-200",
            };
        default:
            return {
                block: "border-gray-600 bg-gray-700/70 text-gray-100",
                badge: "bg-gray-700 text-gray-300",
            };
    }
}
function getItemLabel(item) {
    if (typeof item.params.name === "string" && item.params.name.trim() !== "") {
        return item.params.name;
    }
    if (item.assetId) {
        return item.assetId;
    }
    if (item.sceneConfigId) {
        return item.sceneConfigId;
    }
    return item.id;
}
function TrackHeader({ track, onToggleVisible, onToggleMuted, }) {
    const styles = getTrackStyles(track.type);
    return (_jsxs("div", { className: "sticky left-0 z-10 flex h-14 items-center gap-3 border-b border-r border-gray-800 bg-gray-950/95 px-4 backdrop-blur", style: { width: `${HEADER_WIDTH}px` }, children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "truncate text-sm font-medium text-white", children: track.name }), _jsx("div", { className: `mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${styles.badge}`, children: track.type })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { type: "button", onClick: onToggleVisible, className: `rounded-md border px-2 py-1 text-[11px] font-medium transition ${track.visible
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                            : "border-gray-700 bg-gray-900 text-gray-500 hover:text-gray-300"}`, title: track.visible ? "Hide track" : "Show track", children: "V" }), _jsx("button", { type: "button", onClick: onToggleMuted, className: `rounded-md border px-2 py-1 text-[11px] font-medium transition ${track.muted
                            ? "border-rose-500/40 bg-rose-500/15 text-rose-200"
                            : "border-gray-700 bg-gray-900 text-gray-300 hover:text-white"}`, title: track.muted ? "Unmute track" : "Mute track", children: "M" })] })] }));
}
function TrackItemBlock({ item, trackType }) {
    const styles = getTrackStyles(trackType);
    const selectedItemId = useTimelineStore((state) => state.selectedItemId);
    const isSelected = selectedItemId === item.id;
    return (_jsxs("div", { className: `absolute top-2 bottom-2 overflow-hidden rounded-lg border px-2 py-1 shadow-sm transition ${styles.block} ${isSelected
            ? "ring-2 ring-offset-1 ring-offset-gray-900 ring-white/80"
            : "hover:ring-1 hover:ring-white/20"}`, style: {
            left: `${item.startTime * PIXELS_PER_SECOND}px`,
            width: `${Math.max(item.duration * PIXELS_PER_SECOND, 8)}px`,
        }, onMouseDown: (event) => {
            event.stopPropagation();
        }, onClick: (event) => {
            event.stopPropagation();
            useTimelineStore.setState({
                selectedItemId: item.id,
                selectedTrackId: item.trackId,
            });
        }, title: `${getItemLabel(item)} • ${item.startTime.toFixed(2)}s - ${(item.startTime + item.duration).toFixed(2)}s`, children: [_jsx("div", { className: "truncate text-xs font-medium", children: getItemLabel(item) }), _jsxs("div", { className: "truncate text-[10px] text-white/60", children: [item.startTime.toFixed(1), "s \u2022 ", item.duration.toFixed(1), "s"] })] }));
}
export function Timeline() {
    const timelineRef = useRef(null);
    const rafRef = useRef(null);
    const lastFrameTimeRef = useRef(null);
    const tracks = useTimelineStore((state) => state.tracks);
    const fps = useTimelineStore((state) => state.fps);
    const isPlaying = useTimelineStore((state) => state.isPlaying);
    const currentTime = useTimelineStore((state) => state.currentTime);
    const totalDuration = useTimelineStore((state) => state.totalDuration());
    const setPlaying = useTimelineStore((state) => state.setPlaying);
    const setCurrentTime = useTimelineStore((state) => state.setCurrentTime);
    const updateTrack = useTimelineStore((state) => state.updateTrack);
    const timelineSeconds = Math.max(totalDuration, MIN_TIMELINE_SECONDS);
    const timelineWidth = timelineSeconds * PIXELS_PER_SECOND;
    const timeMarkers = useMemo(() => Array.from({ length: Math.ceil(timelineSeconds) + 1 }, (_, index) => index), [timelineSeconds]);
    useEffect(() => {
        if (!isPlaying) {
            lastFrameTimeRef.current = null;
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            return;
        }
        const tick = (timestamp) => {
            const previousTimestamp = lastFrameTimeRef.current ?? timestamp;
            const deltaSeconds = (timestamp - previousTimestamp) / 1000;
            lastFrameTimeRef.current = timestamp;
            const nextTime = currentTime + deltaSeconds;
            if (nextTime >= totalDuration && totalDuration > 0) {
                setCurrentTime(totalDuration);
                setPlaying(false);
                return;
            }
            setCurrentTime(nextTime);
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            lastFrameTimeRef.current = null;
        };
    }, [currentTime, isPlaying, setCurrentTime, setPlaying, totalDuration]);
    const handleSeek = (clientX) => {
        const timelineElement = timelineRef.current;
        if (!timelineElement) {
            return;
        }
        const rect = timelineElement.getBoundingClientRect();
        const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const nextTime = offsetX / PIXELS_PER_SECOND;
        setCurrentTime(Math.min(nextTime, timelineSeconds));
    };
    return (_jsxs("div", { className: "rounded-xl border border-gray-800 bg-gray-950 p-4", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { type: "button", onClick: () => setPlaying(!isPlaying), className: "rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-400", children: isPlaying ? "Pause" : "Play" }), _jsx("button", { type: "button", onClick: () => {
                                    setPlaying(false);
                                    setCurrentTime(0);
                                }, className: "rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-700", children: "Reset" })] }), _jsxs("div", { className: "flex items-center gap-4 text-sm text-gray-300", children: [_jsxs("span", { children: [formatTime(currentTime), " / ", formatTime(totalDuration)] }), _jsxs("span", { children: ["Frame ", Math.floor(currentTime * fps) + 1] })] })] }), _jsx("div", { className: "mt-3", children: _jsx("input", { type: "range", min: 0, max: Math.max(totalDuration, 0.01), step: 0.01, value: Math.min(currentTime, Math.max(totalDuration, 0.01)), onChange: (event) => setCurrentTime(Number(event.target.value)), className: "h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-800 accent-blue-500" }) }), _jsx("div", { className: "mt-4 overflow-x-auto rounded-lg border border-gray-800", children: _jsxs("div", { className: "grid min-w-max grid-cols-[160px_auto]", style: { gridTemplateColumns: `${HEADER_WIDTH}px ${timelineWidth}px` }, children: [_jsx("div", { className: "sticky left-0 z-20 flex h-10 items-center border-b border-r border-gray-800 bg-gray-950/95 px-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 backdrop-blur", children: "Tracks" }), _jsxs("div", { ref: timelineRef, className: "relative h-10 border-b border-gray-800 bg-gray-900/80", onMouseDown: (event) => handleSeek(event.clientX), children: [timeMarkers.map((second) => (_jsx("div", { className: "absolute inset-y-0 border-l border-gray-800/80", style: { left: `${second * PIXELS_PER_SECOND}px` }, children: _jsx("span", { className: "absolute left-2 top-2 text-[10px] text-gray-500", children: formatTime(second) }) }, second))), _jsx("div", { className: "pointer-events-none absolute inset-y-0 z-10 w-px bg-blue-400", style: { left: `${Math.min(currentTime, timelineSeconds) * PIXELS_PER_SECOND}px` } })] }), tracks.length === 0 ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "sticky left-0 z-10 flex h-14 items-center border-r bg-gray-950/95 px-4 text-sm text-gray-500 backdrop-blur", children: "No tracks" }), _jsx("div", { className: "flex h-14 items-center px-4 text-sm text-gray-500", children: "Add tracks to populate the timeline." })] })) : (tracks.map((track) => (_jsx(FragmentRow, { track: track, timelineWidth: timelineWidth, playheadLeft: Math.min(currentTime, timelineSeconds) * PIXELS_PER_SECOND, onSeek: handleSeek, onToggleMuted: () => updateTrack(track.id, { muted: !track.muted }), onToggleVisible: () => updateTrack(track.id, { visible: !track.visible }) }, track.id))))] }) })] }));
}
function FragmentRow({ track, timelineWidth, playheadLeft, onSeek, onToggleMuted, onToggleVisible, }) {
    const sortedItems = [...track.items].sort((a, b) => a.startTime - b.startTime);
    return (_jsxs(_Fragment, { children: [_jsx(TrackHeader, { track: track, onToggleMuted: onToggleMuted, onToggleVisible: onToggleVisible }), _jsxs("div", { className: "relative border-b border-gray-800 bg-gray-900/40", style: { height: `${ROW_HEIGHT}px`, width: `${timelineWidth}px` }, onMouseDown: (event) => onSeek(event.clientX), children: [Array.from({ length: Math.ceil(timelineWidth / PIXELS_PER_SECOND) + 1 }, (_, index) => (_jsx("div", { className: "absolute inset-y-0 border-l border-gray-800/50", style: { left: `${index * PIXELS_PER_SECOND}px` } }, index))), _jsx("div", { className: "pointer-events-none absolute inset-y-0 z-10 w-px bg-blue-400", style: { left: `${playheadLeft}px` } }), sortedItems.map((item) => (_jsx(TrackItemBlock, { item: item, trackType: track.type }, item.id)))] })] }));
}
