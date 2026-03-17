import { create } from "zustand";
const WELCOME_MESSAGE = {
    id: "welcome",
    role: "assistant",
    content: "Describe the scene you want to build.",
};
function createSessionId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function normalizeMessages(messages) {
    if (!Array.isArray(messages)) {
        return [WELCOME_MESSAGE];
    }
    const normalized = messages
        .map((message) => {
        if (!message || typeof message !== "object") {
            return null;
        }
        const candidate = message;
        if (typeof candidate.id !== "string" ||
            (candidate.role !== "user" && candidate.role !== "assistant") ||
            typeof candidate.content !== "string") {
            return null;
        }
        return {
            id: candidate.id,
            role: candidate.role,
            content: candidate.content,
        };
    })
        .filter((message) => message !== null);
    return normalized.length > 0 ? normalized : [WELCOME_MESSAGE];
}
let activeLoadProjectId = null;
let activeLoadPromise = null;
export const useChatStore = create()((set, get) => ({
    sessionId: createSessionId(),
    messages: [WELCOME_MESSAGE],
    loadedProjectId: null,
    addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
    updateMessage: (id, content) => set((state) => ({
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
            const data = (await response.json());
            set({
                messages: normalizeMessages(data.messages),
                loadedProjectId: projectId,
            });
        })();
        try {
            await activeLoadPromise;
        }
        finally {
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
