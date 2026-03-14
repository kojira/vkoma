import { useMemo, useRef, useState } from "react";

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
  const nextId = useRef(1);

  const canSend = useMemo(() => input.trim().length > 0, [input]);

  const handleSend = () => {
    const value = input.trim();
    if (!value) {
      return;
    }

    setMessages((current) => [
      ...current,
      { id: `user-${nextId.current++}`, role: "user", content: value },
      {
        id: `assistant-${nextId.current++}`,
        role: "assistant",
        content: "Mock response queued. Connect this panel to /api/ai/generate next.",
      },
    ]);
    setInput("");
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
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSend();
              }
            }}
            placeholder="Ask AI to generate a scene..."
            className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500"
          />
          <button
            type="button"
            onClick={handleSend}
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
