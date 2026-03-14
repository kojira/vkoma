import { useMemo, useRef, useState } from "react";
import { useSceneStore } from "../stores/sceneStore";

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

    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: useSceneStore.getState().currentProjectId,
          prompt: value,
        }),
      });

      const data = (await response.json()) as { scenes?: Array<{ id?: string; name?: string; duration?: number; params?: Record<string, unknown>; code?: string }>; error?: string };

      if (!response.ok || data.error) {
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${nextId.current++}`,
            role: "assistant",
            content: `Error: ${data.error ?? "Request failed"}`,
          },
        ]);
        return;
      }

      const scenes = data.scenes ?? [];
      const addScene = useSceneStore.getState().addScene;

      // Clear existing scenes first, then add generated ones
      const store = useSceneStore.getState();
      if (scenes.length > 0) {
        // Remove all existing scenes except the first (store requires at least 1)
        for (const s of store.scenes.slice(1)) {
          useSceneStore.getState().removeScene(s.id);
        }
        // Update the first scene with the first generated scene
        const first = scenes[0];
        if (first) {
          useSceneStore.getState().updateScene(store.scenes[0].id, {
            name: first.name ?? "Scene",
            duration: first.duration ?? 3,
            params: first.params ?? {},
          });
        }
        // Add the remaining scenes
        for (const scene of scenes.slice(1)) {
          addScene({
            id: scene.id ?? `scene-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: scene.name ?? "Scene",
            duration: scene.duration ?? 3,
            params: scene.params ?? {},
          });
        }
      }

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${nextId.current++}`,
          role: "assistant",
          content: `Generated ${scenes.length} scene(s).`,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${nextId.current++}`,
          role: "assistant",
          content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ]);
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
                : "max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-800 px-3 py-2 text-sm text-gray-100"
            }
          >
            {message.content}
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
