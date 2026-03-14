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
  const clearProject = useSceneStore((state) => state.clearProject);
  const projectName = useSceneStore((state) => state.projectName);
  const saveProject = useSceneStore((state) => state.saveProject);
  const setProjectName = useSceneStore((state) => state.setProjectName);

  const exportVideo = async () => {
    if (typeof MediaRecorder === "undefined") {
      window.alert("MediaRecorder is not supported in this browser.");
      return;
    }

    const state = useSceneStore.getState();
    const totalFrames = state.totalFrames();
    if (totalFrames <= 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_WIDTH;
    canvas.height = EXPORT_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Setup audio: use BGM file from store if available
    const audioCtx = new AudioContext();
    let audioSource: AudioBufferSourceNode | null = null;
    const audioDest = audioCtx.createMediaStreamDestination();

    const bgmFile = useSceneStore.getState().bgmFile;
    if (bgmFile) {
      try {
        const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(bgmFile);
        });
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        audioSource = audioCtx.createBufferSource();
        audioSource.buffer = audioBuffer;
        audioSource.loop = true;
        audioSource.connect(audioDest);
        audioSource.start(0);
      } catch (e) {
        console.warn("Failed to decode BGM file, proceeding without audio:", e);
      }
    }

    // Combine canvas video + audio streams
    const videoStream = canvas.captureStream(state.fps);
    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioDest.stream.getAudioTracks(),
    ]);

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";
    const recorder = new MediaRecorder(combinedStream, { mimeType });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.start();
    setExportProgress(0);

    try {
      for (let frame = 0; frame < totalFrames; frame += 1) {
        const exportState = useSceneStore.getState();
        const activeRange = getSceneAtFrame(exportState.scenes, exportState.fps, frame);
        if (!activeRange) continue;

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
      const link = document.createElement('a');
      link.href = url;
      link.download = `vkoma-export-${Date.now()}.webm`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      if (audioSource) {
        try { audioSource.stop(); } catch (_) {}
      }
      try { audioCtx.close(); } catch (_) {}
      videoStream.getTracks().forEach((track) => track.stop());
      combinedStream.getTracks().forEach((track) => track.stop());
      setExportProgress(null);
    }
  };

  const handleRenameProject = () => {
    const nextName = window.prompt("プロジェクト名を入力してください", projectName || "Untitled Project");
    if (!nextName?.trim()) {
      return;
    }

    setProjectName(nextName.trim());
  };

  return (
    <header className="flex items-center justify-between border-b border-gray-800 bg-gray-950 px-6 py-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => clearProject()}
          className="rounded-md border border-gray-700 px-3 py-2 text-sm font-medium text-gray-300 transition hover:border-gray-500 hover:text-white"
        >
          ← プロジェクト一覧
        </button>
        <button
          type="button"
          onClick={handleRenameProject}
          className="text-xl font-semibold tracking-wide text-white"
        >
          {`vKoma - ${projectName || "Untitled Project"}`}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void saveProject()}
          disabled={exportProgress !== null}
          className="rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          💾 保存
        </button>
        <button
          type="button"
          data-testid="export-button"
          onClick={() => void exportVideo()}
          disabled={exportProgress !== null}
          className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-blue-500/60"
        >
          {exportProgress === null ? "Export" : `Exporting ${exportProgress}%`}
        </button>
      </div>
    </header>
  );
}
