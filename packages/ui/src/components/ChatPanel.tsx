import { useMemo, useRef, useState } from "react";
import { useSceneStore, allScenePresets } from "../stores/sceneStore";
import { defineScene, params as sceneParams, type SceneParam } from "../../../../packages/core/src/index";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Describe the scene you want to build.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const nextId = useRef(1);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  const handleSend = async () => {
    const value = input.trim();
    if (!value || isSending) {
      return;
    }

    setInput("");
    setIsSending(true);

    setMessages((current) => [
      ...current,
      { id: `user-${nextId.current++}`, role: "user", content: value },
    ]);

    const streamingMsgId = `assistant-${nextId.current++}`;
    setMessages((current) => [
      ...current,
      { id: streamingMsgId, role: "assistant", content: "Generating..." },
    ]);

    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: useSceneStore.getState().currentProjectId,
          prompt: value,
        }),
      });

      if (!response.ok || !response.body) {
        setMessages((current) =>
          current.map((m) =>
            m.id === streamingMsgId ? { ...m, content: "Error: Request failed" } : m,
          ),
        );
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done: readerDone, value: chunk } = await reader.read();
        if (readerDone) break;

        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          let event: { chunk?: string; scenes?: Array<{ id?: string; name?: string; duration?: number; params?: Record<string, unknown>; code?: string; renderCode?: string }>; error?: string; done?: boolean };
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (event.chunk) {
            setMessages((current) =>
              current.map((m) =>
                m.id === streamingMsgId ? { ...m, content: "Generating..." } : m,
              ),
            );
          }

          if (event.done) {
            if (event.error) {
              setMessages((current) =>
                current.map((m) =>
                  m.id === streamingMsgId ? { ...m, content: `Error: ${event.error}` } : m,
                ),
              );
              return;
            }

            const scenes = event.scenes ?? [];
            const addScene = useSceneStore.getState().addScene;

            function resolveSceneConfig(scene: { code?: string; renderCode?: string; name?: string; duration?: number; params?: Record<string, unknown> }) {
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
                  // fall through to undefined
                }
              }
              return undefined;
            }

            // Clear existing scenes first, then add generated ones
            const store = useSceneStore.getState();
            if (scenes.length > 0) {
              for (const s of store.scenes.slice(1)) {
                useSceneStore.getState().removeScene(s.id);
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
            }

            setMessages((current) =>
              current.map((m) =>
                m.id === streamingMsgId
                  ? { ...m, content: `Generated ${scenes.length} scene(s).` }
                  : m,
              ),
            );
          }
        }
      }
    } catch (error) {
      setMessages((current) =>
        current.map((m) =>
          m.id === streamingMsgId
            ? { ...m, content: `Error: ${error instanceof Error ? error.message : "Unknown error"}` }
            : m,
        ),
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="flex h-[24rem] w-full flex-col rounded-xl border border-gray-800 bg-gray-950 lg:h-full lg:w-80">
      <div className="border-b border-gray-800 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-300">
          AI Chat
        </h2>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-blue-500 px-3 py-2 text-sm text-white"
                : message.content.startsWith("Error:")
                  ? "max-w-[85%] rounded-2xl rounded-bl-sm bg-red-900/50 border border-red-500/30 px-3 py-2 text-sm text-red-300"
                  : "max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-800 px-3 py-2 text-sm text-gray-100"
            }
          >
            {message.content === "Generating..." ? (
              <span className="flex items-center gap-2">
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                生成中...
              </span>
            ) : message.content.startsWith("Error:") ? (
              <span className="flex items-center gap-1.5">⚠️ {message.content}</span>
            ) : (
              message.content
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
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}
