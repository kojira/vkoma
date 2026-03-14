import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import { renderScene } from "@vkoma/core";
import { getSceneAtFrame, useSceneStore } from "../stores/sceneStore";
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
export function PreviewCanvas() {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const frameAccumulatorRef = useRef(0);
    const lastTimestampRef = useRef(null);
    const scenes = useSceneStore((state) => state.scenes);
    const currentSceneIndex = useSceneStore((state) => state.currentSceneIndex);
    const currentFrame = useSceneStore((state) => state.currentFrame);
    const isPlaying = useSceneStore((state) => state.isPlaying);
    const fps = useSceneStore((state) => state.fps);
    const setCurrentFrame = useSceneStore((state) => state.setCurrentFrame);
    const setCurrentScene = useSceneStore((state) => state.setCurrentScene);
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
        renderScene(range.scene, ctx, CANVAS_WIDTH, CANVAS_HEIGHT, localTime);
    }, [currentFrame, currentSceneIndex, fps, scenes, setCurrentScene]);
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
