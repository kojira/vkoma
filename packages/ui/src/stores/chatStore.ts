import { create } from "zustand";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Describe the scene you want to build.",
};

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ChatStore {
  sessionId: string;
  messages: ChatMessage[];
  loadedProjectId: string | null;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, content: string) => void;
  clearMessages: () => void;
  resetSession: () => void;
  loadFromServer: (projectId: string) => Promise<void>;
  saveToServer: (projectId: string) => Promise<void>;
}

function normalizeMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) {
    return [WELCOME_MESSAGE];
  }

  const normalized = messages
    .map((message) => {
      if (!message || typeof message !== "object") {
        return null;
      }

      const candidate = message as Partial<ChatMessage>;
      if (
        typeof candidate.id !== "string" ||
        (candidate.role !== "user" && candidate.role !== "assistant") ||
        typeof candidate.content !== "string"
      ) {
        return null;
      }

      return {
        id: candidate.id,
        role: candidate.role,
        content: candidate.content,
      } satisfies ChatMessage;
    })
    .filter((message): message is ChatMessage => message !== null);

  return normalized.length > 0 ? normalized : [WELCOME_MESSAGE];
}

let activeLoadProjectId: string | null = null;
let activeLoadPromise: Promise<void> | null = null;

export const useChatStore = create<ChatStore>()((set, get) => ({
  sessionId: createSessionId(),
  messages: [WELCOME_MESSAGE],
  loadedProjectId: null,
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, content } : m)),
    })),
  clearMessages: () => set({ messages: [WELCOME_MESSAGE] }),
  resetSession: () => set({ sessionId: createSessionId() }),
  loadFromServer: async (projectId) => {
    if (!projectId.trim()) {
      set({ messages: [WELCOME_MESSAGE], loadedProjectId: null });
      return;
    }

    if (activeLoadProjectId === projectId && activeLoadPromise) {
      return activeLoadPromise;
    }

    activeLoadProjectId = projectId;
    activeLoadPromise = (async () => {
      const response = await fetch(`/api/projects/${projectId}/chat-history`);
      if (!response.ok) {
        throw new Error("Failed to load chat history");
      }

      const data = (await response.json()) as { messages?: unknown };
      set({
        messages: normalizeMessages(data.messages),
        loadedProjectId: projectId,
      });
    })();

    try {
      await activeLoadPromise;
    } finally {
      if (activeLoadProjectId === projectId) {
        activeLoadProjectId = null;
        activeLoadPromise = null;
      }
    }
  },
  saveToServer: async (projectId) => {
    if (!projectId.trim()) {
      return;
    }

    const response = await fetch(`/api/projects/${projectId}/chat-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: get().messages,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to save chat history");
    }

    set({ loadedProjectId: projectId });
  },
}));
