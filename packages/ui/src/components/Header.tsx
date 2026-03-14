import { useState } from "react";
import { renderScene } from "@vkoma/core";
import { getSceneAtFrame, useSceneStore } from "../stores/sceneStore";

const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function Header() {
  const [exportProgress, setExportProgress] = useState<number | null>(null);

  const exportVideo = async () => {
    if (typeof MediaRecorder === "undefined") {
      window.alert("MediaRecorder is not supported in this browser.");
      return;
    }

    const state = useSceneStore.getState();
    const totalFrames = state.totalFrames();
    if (totalFrames <= 0) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = EXPORT_WIDTH;
    canvas.height = EXPORT_HEIGHT;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const stream = canvas.captureStream(state.fps);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.start();
    setExportProgress(0);

    try {
      for (let frame = 0; frame < totalFrames; frame += 1) {
        const exportState = useSceneStore.getState();
        const activeRange = getSceneAtFrame(exportState.scenes, exportState.fps, frame);
        if (!activeRange) {
          continue;
        }

        const localTime = (frame - activeRange.startFrame) / exportState.fps;
        renderScene(activeRange.scene, ctx, EXPORT_WIDTH, EXPORT_HEIGHT, localTime);
        setExportProgress(Math.round(((frame + 1) / totalFrames) * 100));
        await wait(1000 / exportState.fps);
      }

      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vkoma-export-${Date.now()}.webm`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      stream.getTracks().forEach((track) => track.stop());
      setExportProgress(null);
    }
  };

  return (
    <header className="flex items-center justify-between border-b border-gray-800 bg-gray-950 px-6 py-4">
      <h1 className="text-xl font-semibold tracking-wide text-white">vKoma</h1>
      <button
        type="button"
        onClick={() => void exportVideo()}
        disabled={exportProgress !== null}
        className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-blue-500/60"
      >
        {exportProgress === null ? "Export" : `Exporting ${exportProgress}%`}
      </button>
    </header>
  );
}
