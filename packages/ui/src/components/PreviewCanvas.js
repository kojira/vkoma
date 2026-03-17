import { jsx as _jsx } from "react/jsx-runtime";
import { Component, useEffect, useRef } from "react";
import { renderScene } from "@vkoma/core";
import { getSceneAtFrame, useSceneStore } from "../stores/sceneStore";
import { useTimelineStore } from "../stores/timelineStore";
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const imageCache = new Map();
class PreviewCanvasErrorBoundary extends Component {
    state = { hasError: false };
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    componentDidCatch(error, errorInfo) {
        console.error("PreviewCanvas failed to render", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (_jsx("div", { className: "w-full rounded-xl border border-red-900/60 bg-gray-950 p-4 shadow-2xl", children: _jsx("div", { className: "flex aspect-video w-full items-center justify-center rounded-lg border border-red-900/60 bg-black px-6 text-center text-sm text-red-200", children: "Preview rendering failed." }) }));
        }
        return this.props.children;
    }
}
const toImageUrl = (path) => {
    if (path.startsWith("/") && !path.startsWith("/api/")) {
        const filename = path.split("/").pop() ?? "";
        return `/api/mv-assets/${encodeURIComponent(filename)}`;
    }
    return path;
};
function PreviewCanvasInner() {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const audioRef = useRef(null);
    const audioUrlRef = useRef(null);
    const frameAccumulatorRef = useRef(0);
    const lastTimestampRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const sourceRef = useRef(null);
    const liveFFTRef = useRef([]);
    const timelineAudioRefs = useRef(new Map());
    const scenes = useSceneStore((state) => state.scenes);
    const bgmFile = useSceneStore((state) => state.bgmFile);
    const currentSceneIndex = useSceneStore((state) => state.currentSceneIndex);
    const currentFrame = useSceneStore((state) => state.currentFrame);
    const isPlaying = useSceneStore((state) => state.isPlaying);
    const fps = useSceneStore((state) => state.fps);
    const fftCache = useSceneStore((state) => state.fftCache);
    const setCurrentFrame = useSceneStore((state) => state.setCurrentFrame);
    const setCurrentScene = useSceneStore((state) => state.setCurrentScene);
    const timelineTracks = useTimelineStore((state) => state.tracks);
    const timelineProjectId = useTimelineStore((state) => state.projectId);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }
        const activeRange = getSceneAtFrame(scenes, fps, currentFrame);
        const selectedScene = scenes[currentSceneIndex];
        const range = activeRange ?? (selectedScene ? { scene: selectedScene, startFrame: 0 } : null);
        if (!range) {
            ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            return;
        }
        if (activeRange && activeRange.index !== currentSceneIndex) {
            setCurrentScene(activeRange.index);
        }
        const localFrame = Math.max(0, currentFrame - (activeRange?.startFrame ?? 0));
        const localTime = localFrame / fps;
        const bgImagePath = typeof range.scene.params?.bgImagePath === "string" ? range.scene.params.bgImagePath : "";
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        const fftFrame = fftCache?.frames[currentFrame];
        const liveFFT = liveFFTRef.current;
        const hasLiveFFT = liveFFT.length > 0 && isPlaying;
        const sceneForRender = hasLiveFFT
            ? {
                ...range.scene,
                params: {
                    ...range.scene.params,
                    fftBands: JSON.stringify(liveFFT),
                    beatIntensity: 0,
                },
            }
            : fftFrame
                ? {
                    ...range.scene,
                    params: {
                        ...range.scene.params,
                        fftBands: JSON.stringify(fftFrame.bands),
                        beatIntensity: fftFrame.beatIntensity,
                    },
                }
                : range.scene;
        renderScene(sceneForRender, ctx, CANVAS_WIDTH, CANVAS_HEIGHT, localTime);
        if (bgImagePath) {
            const imageUrl = toImageUrl(bgImagePath);
            let image = imageCache.get(imageUrl);
            if (!image) {
                image = new Image();
                image.src = imageUrl;
                imageCache.set(imageUrl, image);
                image.onload = () => {
                    // Trigger re-render when image loads
                    const canvas = canvasRef.current;
                    const ctx2 = canvas?.getContext("2d");
                    if (!ctx2)
                        return;
                    ctx2.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                    renderScene(sceneForRender, ctx2, CANVAS_WIDTH, CANVAS_HEIGHT, localTime);
                    try {
                        ctx2.globalCompositeOperation = "destination-over";
                        ctx2.drawImage(image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                        ctx2.globalCompositeOperation = "source-over";
                    }
                    catch {
                        // Ignore broken image errors
                    }
                };
            }
            if (image.complete && image.naturalWidth > 0) {
                try {
                    ctx.globalCompositeOperation = "destination-over";
                    ctx.drawImage(image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                    ctx.globalCompositeOperation = "source-over";
                }
                catch {
                    // Ignore drawImage errors (e.g. Safari DOMException for broken images)
                }
            }
        }
    }, [currentFrame, currentSceneIndex, fftCache, fps, isPlaying, scenes, setCurrentScene]);
    useEffect(() => {
        if (!audioRef.current) {
            audioRef.current = new Audio();
        }
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        audio.pause();
        if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
            audioUrlRef.current = null;
        }
        if (!bgmFile) {
            audio.removeAttribute("src");
            audio.load();
            return;
        }
        const objectUrl = URL.createObjectURL(bgmFile);
        audioUrlRef.current = objectUrl;
        audio.src = objectUrl;
        audio.load();
    }, [bgmFile]);
    useEffect(() => {
        return () => {
            const audio = audioRef.current;
            if (audio) {
                audio.pause();
                audio.removeAttribute("src");
                audio.load();
            }
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
                audioUrlRef.current = null;
            }
            if (audioContextRef.current) {
                void audioContextRef.current.close();
                audioContextRef.current = null;
                analyserRef.current = null;
                sourceRef.current = null;
            }
        };
    }, []);
    // Timeline audio track playback
    useEffect(() => {
        const audioTracks = timelineTracks.filter((t) => t.type === "audio");
        const currentAudios = timelineAudioRefs.current;
        const activeIds = new Set();
        for (const track of audioTracks) {
            if (track.muted)
                continue;
            for (const item of track.items) {
                if (!item.assetId || !timelineProjectId)
                    continue;
                activeIds.add(item.id);
                if (!currentAudios.has(item.id)) {
                    const audio = new Audio(`/api/projects/${timelineProjectId}/assets/${item.assetId}/file`);
                    audio.preload = "auto";
                    const volume = typeof item.params?.volume === "number" ? item.params.volume : 1.0;
                    audio.volume = Math.max(0, Math.min(1, volume));
                    currentAudios.set(item.id, audio);
                }
            }
        }
        for (const [id, audio] of currentAudios) {
            if (!activeIds.has(id)) {
                audio.pause();
                audio.removeAttribute("src");
                audio.load();
                currentAudios.delete(id);
            }
        }
    }, [timelineTracks, timelineProjectId]);
    // Sync timeline audio playback with play state
    useEffect(() => {
        const audioTracks = timelineTracks.filter((t) => t.type === "audio" && !t.muted);
        const currentAudios = timelineAudioRefs.current;
        const globalTime = currentFrame / fps;
        for (const track of audioTracks) {
            for (const item of track.items) {
                const audio = currentAudios.get(item.id);
                if (!audio)
                    continue;
                const itemStart = item.startTime ?? 0;
                const itemDuration = item.duration ?? Infinity;
                const itemEnd = itemStart + itemDuration;
                const localTime = globalTime - itemStart;
                if (globalTime >= itemStart && globalTime < itemEnd) {
                    if (Math.abs(audio.currentTime - localTime) >= 0.5) {
                        audio.currentTime = Math.max(0, localTime);
                    }
                    if (isPlaying) {
                        void audio.play().catch(() => { });
                    }
                    else {
                        audio.pause();
                    }
                }
                else {
                    audio.pause();
                }
            }
        }
    }, [currentFrame, fps, isPlaying, timelineTracks]);
    // Cleanup timeline audio on unmount
    useEffect(() => {
        return () => {
            for (const [, audio] of timelineAudioRefs.current) {
                audio.pause();
                audio.removeAttribute("src");
                audio.load();
            }
            timelineAudioRefs.current.clear();
        };
    }, []);
    useEffect(() => {
        window.__vkoma_seekToFrame = (frameIndex, _fps) => {
            useSceneStore.getState().setPlaying(false);
            useSceneStore.getState().setCurrentFrame(frameIndex);
        };
        return () => {
            delete window.__vkoma_seekToFrame;
        };
    }, []);
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !bgmFile) {
            return;
        }
        const targetTime = currentFrame / fps;
        if (Math.abs(audio.currentTime - targetTime) >= 0.5) {
            audio.currentTime = targetTime;
        }
        if (isPlaying) {
            // Initialize AudioContext on user-initiated play (autoplay policy)
            if (!audioContextRef.current) {
                const ctx = new AudioContext();
                audioContextRef.current = ctx;
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 128;
                analyserRef.current = analyser;
                const source = ctx.createMediaElementSource(audio);
                source.connect(analyser);
                analyser.connect(ctx.destination);
                sourceRef.current = source;
            }
            if (audioContextRef.current.state === "suspended") {
                void audioContextRef.current.resume();
            }
            void audio.play().catch(() => { });
            return;
        }
        audio.pause();
    }, [bgmFile, currentFrame, fps, isPlaying]);
    useEffect(() => {
        if (!isPlaying) {
            if (animationRef.current !== null) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
            lastTimestampRef.current = null;
            frameAccumulatorRef.current = 0;
            return;
        }
        const totalFrames = useSceneStore.getState().totalFrames();
        if (totalFrames <= 0) {
            return;
        }
        const step = 1000 / fps;
        const tick = (timestamp) => {
            if (lastTimestampRef.current === null) {
                lastTimestampRef.current = timestamp;
            }
            const delta = timestamp - lastTimestampRef.current;
            lastTimestampRef.current = timestamp;
            frameAccumulatorRef.current += delta;
            // Read live FFT data each frame
            if (analyserRef.current) {
                const analyser = analyserRef.current;
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(dataArray);
                const bands = [];
                for (let i = 0; i < dataArray.length; i++) {
                    bands.push(dataArray[i] / 255);
                }
                liveFFTRef.current = bands;
            }
            if (frameAccumulatorRef.current >= step) {
                const framesToAdvance = Math.floor(frameAccumulatorRef.current / step);
                frameAccumulatorRef.current -= framesToAdvance * step;
                const state = useSceneStore.getState();
                const nextTotalFrames = state.totalFrames();
                const nextFrame = nextTotalFrames > 0 ? (state.currentFrame + framesToAdvance) % nextTotalFrames : 0;
                state.setCurrentFrame(nextFrame);
            }
            animationRef.current = requestAnimationFrame(tick);
        };
        animationRef.current = requestAnimationFrame(tick);
        return () => {
            if (animationRef.current !== null) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
        };
    }, [fps, isPlaying, setCurrentFrame]);
    return (_jsx("div", { className: "w-full rounded-xl border border-gray-800 bg-gray-950 p-4 shadow-2xl", children: _jsx("div", { className: "relative aspect-video w-full overflow-hidden rounded-lg border border-gray-800 bg-black", children: _jsx("canvas", { ref: canvasRef, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, className: "absolute inset-0 h-full w-full" }) }) }));
}
export function PreviewCanvas() {
    return (_jsx(PreviewCanvasErrorBoundary, { children: _jsx(PreviewCanvasInner, {}) }));
}
