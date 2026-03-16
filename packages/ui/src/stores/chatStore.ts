import { create } from "zustand";
import { persist } from "zustand/middleware";

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

interface ChatStore {
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, content: string) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      messages: [WELCOME_MESSAGE],
      addMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message] })),
      updateMessage: (id, content) =>
        set((state) => ({
          messages: state.messages.map((m) => (m.id === id ? { ...m, content } : m)),
        })),
      clearMessages: () => set({ messages: [WELCOME_MESSAGE] }),
    }),
    {
      name: "vkoma-chat",
    },
  ),
);
