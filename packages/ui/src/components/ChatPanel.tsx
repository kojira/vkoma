import { Fragment, type ReactNode, useMemo, useState } from "react";
import { useSceneStore, allScenePresets } from "../stores/sceneStore";
import { useTimelineStore } from "../stores/timelineStore";
import { useChatStore } from "../stores/chatStore";
import { defineScene, params as sceneParams, type SceneParam } from "../../../../packages/core/src/index";

type GeneratedScene = {
  id?: string;
  name?: string;
  duration?: number;
  params?: Record<string, unknown>;
  code?: string;
  renderCode?: string;
};

type AudioTrackRequest = {
  assetId: string;
  name?: string;
  startTime?: number;
  duration?: number;
  volume?: number;
};

type SSEEvent =
  | { type: "text"; content: string }
  | { type: "scenes"; scenes: GeneratedScene[] }
  | { type: "audioTracks"; audioTracks: AudioTrackRequest[] }
  | { type: "message"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };

function createMessageId(role: "user" | "assistant"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${role}-${crypto.randomUUID()}`;
  }

  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function extractJsonObject(text: string): string | null {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    return extractJsonObject(codeBlockMatch[1]);
  }

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      if (depth === 0) {
        continue;
      }
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function decodeJsonStringFragment(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value
      .replace(/\\"/g, "\"")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t");
  }
}

function extractStreamingMessagePreview(rawText: string): string {
  const jsonText = extractJsonObject(rawText);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as { message?: unknown };
      if (typeof parsed.message === "string") {
        return parsed.message;
      }
    } catch {
      // Fall through to partial extraction.
    }
  }

  const keyIndex = rawText.indexOf("\"message\"");
  if (keyIndex < 0) {
    return "";
  }

  const colonIndex = rawText.indexOf(":", keyIndex);
  if (colonIndex < 0) {
    return "";
  }

  const firstQuoteIndex = rawText.indexOf("\"", colonIndex + 1);
  if (firstQuoteIndex < 0) {
    return "";
  }

  let escaping = false;
  let value = "";
  for (let index = firstQuoteIndex + 1; index < rawText.length; index += 1) {
    const char = rawText[index];
    if (escaping) {
      value += `\\${char}`;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === "\"") {
      return decodeJsonStringFragment(value);
    }

    value += char;
  }

  return decodeJsonStringFragment(value);
}

function getStreamingMessagePreview(rawText: string): string {
  const preview = extractStreamingMessagePreview(rawText).trim();
  return preview || "考え中...";
}

function buildCompletionSummary(sceneCount: number, audioTrackCount: number): string {
  if (sceneCount === 0 && audioTrackCount === 0) {
    return "";
  }

  if (sceneCount === 0) {
    return `✅ ${audioTrackCount}オーディオトラックを追加しました`;
  }

  let summary = `✅ ${sceneCount}シーンを生成しました`;
  if (audioTrackCount > 0) {
    summary += ` + ${audioTrackCount}オーディオトラック`;
  }
  return summary;
}

function renderInlineMarkdown(text: string) {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</Fragment>,
      );
    }

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={`bold-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={`code-${match.index}`}
          className="rounded bg-black/30 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`text-${lastIndex}`}>{text.slice(lastIndex)}</Fragment>);
  }

  return nodes.length > 0 ? nodes : text;
}

function renderMessageContent(content: string) {
  const blocks = content.split(/```/);

  return blocks.map((block, index) => {
    if (index % 2 === 1) {
      const normalized = block.replace(/^\w+\n/, "");
      return (
        <pre
          key={`code-block-${index}`}
          className="mt-2 overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-gray-100"
        >
          <code>{normalized}</code>
        </pre>
      );
    }

    return (
      <div key={`text-block-${index}`} className="whitespace-pre-wrap">
        {renderInlineMarkdown(block)}
      </div>
    );
  });
}

export function ChatPanel() {
  const messages = useChatStore((state) => state.messages);
  const sessionId = useChatStore((state) => state.sessionId);
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const clearMessages = useChatStore((state) => state.clearMessages);
  const resetSession = useChatStore((state) => state.resetSession);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  const applyGeneratedScenes = async (scenes: GeneratedScene[]) => {
    if (scenes.length === 0) {
      return;
    }

    const timelineStore = useTimelineStore.getState();
    let videoTrack = timelineStore.tracks.find((track) => track.type === "video");
    if (!videoTrack) {
      timelineStore.addTrack("video", "映像");
      videoTrack = useTimelineStore.getState().tracks.find((track) => track.type === "video");
    }

    let nextStartTime = videoTrack?.items.reduce((max, item) => {
      return Math.max(max, item.startTime + item.duration);
    }, 0) ?? 0;

    if (videoTrack) {
      for (const scene of scenes) {
        const duration = scene.duration ?? 3;
        const sceneConfigId =
          scene.code ?? `dynamic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        useTimelineStore.getState().addItem(videoTrack.id, {
          startTime: nextStartTime,
          duration,
          sceneConfigId,
          params: scene.params ?? {},
          renderCode: scene.renderCode,
        });
        nextStartTime += duration;
      }
    }

    const addScene = useSceneStore.getState().addScene;

    const resolveSceneConfig = (scene: GeneratedScene) => {
      if (scene.code) {
        const preset = allScenePresets.find((p) => p.id === scene.code);
        if (preset) return preset;
      }
      if (scene.renderCode) {
        try {
          const drawFn = new Function("ctx", "params", "time", scene.renderCode) as (
            ctx: CanvasRenderingContext2D,
            params: Record<string, unknown>,
            time: number,
          ) => void;
          const defaultParams: Record<string, SceneParam> = {};
          if (scene.params) {
            for (const [key, value] of Object.entries(scene.params)) {
              if (typeof value === "number") {
                defaultParams[key] = sceneParams.number(key, value);
              } else if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
                defaultParams[key] = sceneParams.color(key, value);
              } else if (typeof value === "string") {
                defaultParams[key] = sceneParams.string(key, value);
              }
            }
          }
          return defineScene({
            id: `dynamic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: scene.name ?? "Dynamic Scene",
            duration: scene.duration ?? 3,
            defaultParams,
            draw: drawFn,
          });
        } catch {
          return undefined;
        }
      }
      return undefined;
    };

    const store = useSceneStore.getState();
    for (const scene of store.scenes.slice(1)) {
      useSceneStore.getState().removeScene(scene.id);
    }

    const first = scenes[0];
    if (first) {
      const firstConfig = resolveSceneConfig(first);
      useSceneStore.getState().updateScene(store.scenes[0].id, {
        name: first.name ?? "Scene",
        duration: first.duration ?? 3,
        params: first.params ?? {},
        ...(firstConfig ? { sceneConfig: firstConfig } : {}),
      });
    }

    for (const scene of scenes.slice(1)) {
      const sceneConfig = resolveSceneConfig(scene);
      addScene({
        id: scene.id ?? `scene-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: scene.name ?? "Scene",
        duration: scene.duration ?? 3,
        params: scene.params ?? {},
        ...(sceneConfig ? { sceneConfig } : {}),
      });
    }

    await useTimelineStore.getState().saveProject();
    await useSceneStore.getState().saveProject();
  };

  const applyAudioTracks = async (audioTracks: AudioTrackRequest[]) => {
    if (audioTracks.length === 0) {
      return;
    }

    const timelineStore = useTimelineStore.getState();
    const fallbackDuration = timelineStore.totalDuration();

    for (const trackRequest of audioTracks) {
      let audioTrack = useTimelineStore.getState().tracks.find((track) => track.type === "audio");
      if (!audioTrack) {
        useTimelineStore.getState().addTrack("audio", "オーディオ");
        audioTrack = useTimelineStore.getState().tracks.find((track) => track.type === "audio");
      }

      if (!audioTrack || !trackRequest.assetId) {
        continue;
      }

      useTimelineStore.getState().addItem(audioTrack.id, {
        startTime: trackRequest.startTime ?? 0,
        duration: trackRequest.duration ?? fallbackDuration,
        assetId: trackRequest.assetId,
        params: { volume: trackRequest.volume ?? 1.0 },
      });
    }

    await useTimelineStore.getState().saveProject();
  };

  const handleSend = async () => {
    const value = input.trim();
    if (!value || isSending) {
      return;
    }

    setInput("");
    setIsSending(true);

    addMessage({
      id: createMessageId("user"),
      role: "user",
      content: value,
    });

    const streamingMsgId = createMessageId("assistant");
    setStreamingMessageId(streamingMsgId);
    addMessage({ id: streamingMsgId, role: "assistant", content: "" });

    try {
      const projectId =
        useTimelineStore.getState().projectId ?? useSceneStore.getState().currentProjectId;
      const assets = useTimelineStore.getState().assets;
      const assetInfo = assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        filename: asset.filename,
        mimeType: asset.mimeType,
      }));

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: value,
          projectId,
          assets: assetInfo,
        }),
      });

      if (!response.ok || !response.body) {
        updateMessage(streamingMsgId, "Error: Request failed");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";
      let finalMessage = "";
      let generatedScenes: GeneratedScene[] = [];
      let generatedAudioTracks: AudioTrackRequest[] = [];

      for (;;) {
        const { done: readerDone, value: chunk } = await reader.read();
        if (readerDone) break;

        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          let event: SSEEvent;
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (event.type === "text") {
            accumulatedText += event.content;
            updateMessage(streamingMsgId, getStreamingMessagePreview(accumulatedText));
            continue;
          }

          if (event.type === "scenes") {
            generatedScenes = event.scenes;
            try {
              await applyGeneratedScenes(generatedScenes);
            } catch (error) {
              console.error("Failed to apply generated scenes:", error);
            }
            continue;
          }

          if (event.type === "audioTracks") {
            generatedAudioTracks = event.audioTracks;
            try {
              await applyAudioTracks(generatedAudioTracks);
            } catch (error) {
              console.error("Failed to apply audio tracks:", error);
            }
            continue;
          }

          if (event.type === "message") {
            finalMessage = event.content;
            const summary = buildCompletionSummary(generatedScenes.length, generatedAudioTracks.length);
            updateMessage(streamingMsgId, [finalMessage, summary].filter(Boolean).join("\n\n"));
            continue;
          }

          if (event.type === "error") {
            updateMessage(streamingMsgId, `Error: ${event.message}`);
            return;
          }

          if (event.type === "done") {
            const preview = getStreamingMessagePreview(accumulatedText);
            const summary = buildCompletionSummary(generatedScenes.length, generatedAudioTracks.length);
            const fallbackMessage = finalMessage || preview;
            updateMessage(streamingMsgId, [fallbackMessage, summary].filter(Boolean).join("\n\n"));
          }
        }
      }
    } catch (error) {
      updateMessage(
        streamingMsgId,
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setStreamingMessageId(null);
      setIsSending(false);
    }
  };

  return (
    <aside className="flex h-[24rem] w-full flex-col rounded-xl border border-gray-800 bg-gray-950 lg:h-full lg:w-80">
      <div className="border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-300">
            AI Chat
          </h2>
          <button
            type="button"
            onClick={() => {
              clearMessages();
              resetSession();
            }}
            disabled={isSending}
            className="rounded-md border border-gray-700 px-2.5 py-1 text-xs font-medium text-gray-300 transition hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            New Chat
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-blue-500 px-3 py-2 text-sm text-white"
                : message.content.startsWith("Error:")
                  ? "max-w-[85%] rounded-2xl rounded-bl-sm border border-red-500/30 bg-red-900/50 px-3 py-2 text-sm text-red-300"
                  : "max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-800 px-3 py-2 text-sm text-gray-100"
            }
          >
            {message.id === streamingMessageId ? (
              <div className="flex items-start gap-2">
                <svg className="h-3.5 w-3.5 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <div className="min-w-0 break-words">
                  {renderMessageContent(message.content || "考え中...")}
                </div>
              </div>
            ) : message.content.startsWith("Error:") ? (
              <span className="flex items-center gap-1.5">⚠️ {message.content}</span>
            ) : (
              <div className="break-words">{renderMessageContent(message.content)}</div>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-gray-800 p-4">
        <div className="flex gap-2">
          <input
            data-testid="chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleSend();
              }
            }}
            placeholder="Ask AI to generate a scene..."
            className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500"
          />
          <button
            data-testid="chat-send"
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-gray-700"
          >
            {isSending ? "生成中..." : "Send"}
          </button>
        </div>
      </div>
    </aside>
  );
}
