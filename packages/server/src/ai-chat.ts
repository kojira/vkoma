import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import type { Hono } from "hono";

type ChatAsset = {
  id?: string;
  name?: string;
  type?: string;
  filename?: string;
  mimeType?: string;
};

type ChatRequestBody = {
  sessionId?: string;
  message?: string;
  projectId?: string;
  assets?: ChatAsset[];
};

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type ScenePayload = {
  id?: string;
  name?: string;
  duration?: number;
  params?: Record<string, unknown>;
  code?: string;
  renderCode?: string;
};

type AudioTrackPayload = {
  assetId?: string;
  startTime?: number;
  duration?: number;
  volume?: number;
};

type ParsedAiResponse = {
  scenes?: ScenePayload[];
  audioTracks?: AudioTrackPayload[];
  message?: string;
};

const MODEL = "claude-sonnet-4-20250514";
const MAX_HISTORY_MESSAGES = 20;
const sessionHistories = new Map<string, ConversationMessage[]>();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let systemPromptPromise: Promise<string> | null = null;

function baseSystemPrompt(sceneAuthoringGuide: string): string {
  return [
    "You are the AI chat assistant for vKoma, a video creation tool.",
    "Your job is to help the user create, modify, and reason about video scenes and timeline content.",
    "When the user asks to create or modify scenes, you must respond with a single JSON object only.",
    'The JSON schema is: {"message":"text to show user","scenes":[...],"audioTracks":[...]}.',
    'IMPORTANT: Always put the "message" field FIRST in the JSON object, before "scenes" and "audioTracks". This enables streaming display.',
    'If the user is only chatting and not asking to create or modify scenes, respond with just {"message":"your response"}.',
    "Respond in Japanese unless the user writes in English.",
    "When scenes are included, every scene must contain:",
    "- id: string",
    "- name: string",
    "- duration: number in seconds",
    "- params: object with actual parameter values, not placeholders",
    "- code: preset id OR renderCode: Canvas 2D drawing function body",
    "Allowed preset ids:",
    "- title-scene",
    "- subtitle-scene",
    "- color-scene",
    "- bouncing-text-scene",
    "- outro-scene",
    "- particles-scene",
    "- gradient-scene",
    "- zoom-in-scene",
    "- slide-in-scene",
    "- fade-in-scene",
    "For renderCode:",
    "- renderCode is the function body for parameters (ctx, params, time)",
    "- ctx is CanvasRenderingContext2D",
    "- params is the params object",
    "- time is the current time in seconds",
    "- Always generate actual drawing code",
    "- Never return empty renderCode",
    "- Never leave TODOs or comments instead of drawing logic",
    'Audio tracks must use this schema: {"assetId":"...","startTime":0,"duration":10,"volume":0.8}.',
    "The message field is conversational text shown to the user in the chat UI.",
    'The message field should contain a detailed, natural explanation of what you created. Describe the visual composition, timing, and creative choices. For example: "3つのシーンで構成しました。最初のタイトルシーンでは白背景に大きな文字でタイトルを表示し、バウンスアニメーションで登場させます。2つ目は...".',
    "Be conversational and helpful. If the user's request is ambiguous, ask clarifying questions in the message field instead of guessing.",
    "When you generate scenes, give detailed descriptions of what each scene does and how it behaves over time.",
    "If the user mentions available assets, use their exact asset ids when creating audioTracks.",
    "Return valid JSON with double quotes and no markdown wrappers.",
    "Detailed scene authoring reference follows.",
    sceneAuthoringGuide,
  ].join("\n");
}

async function getSystemPrompt(): Promise<string> {
  if (!systemPromptPromise) {
    systemPromptPromise = readFile(
      path.resolve(__dirname, "../../..", "docs/scene-authoring.md"),
      "utf8",
    )
      .then((sceneAuthoringGuide) => baseSystemPrompt(sceneAuthoringGuide))
      .catch(() => baseSystemPrompt("Scene authoring guide unavailable."));
  }

  return systemPromptPromise;
}

function formatAssets(assets: ChatAsset[]): string {
  if (assets.length === 0) {
    return "";
  }

  const lines = assets.map((asset) =>
    `- id: ${asset.id ?? ""}, name: ${asset.name ?? ""}, type: ${asset.type ?? ""}, filename: ${asset.filename ?? ""}, mimeType: ${asset.mimeType ?? ""}`,
  );

  return `\n\nAvailable assets:\n${lines.join("\n")}`;
}

function buildUserMessage(body: Required<Pick<ChatRequestBody, "message" | "projectId">> & {
  assets: ChatAsset[];
}): string {
  const projectContext = body.projectId ? `Project ID: ${body.projectId}\n\n` : "";
  return `${projectContext}User request:\n${body.message}${formatAssets(body.assets)}`;
}

function trimHistory(history: ConversationMessage[]): ConversationMessage[] {
  return history.slice(-MAX_HISTORY_MESSAGES);
}

function extractJsonObject(text: string): string | null {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    const candidate = extractJsonObject(codeBlockMatch[1]);
    if (candidate) {
      return candidate;
    }
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

function parseAiResponse(text: string): ParsedAiResponse {
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    throw new Error("Failed to extract JSON from AI response");
  }

  const parsed = JSON.parse(jsonText) as ParsedAiResponse;
  return {
    scenes: Array.isArray(parsed.scenes) ? parsed.scenes : undefined,
    audioTracks: Array.isArray(parsed.audioTracks) ? parsed.audioTracks : undefined,
    message: typeof parsed.message === "string" ? parsed.message : undefined,
  };
}

export function handleAiChat(app: Hono): void {
  app.post("/api/ai/chat", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as ChatRequestBody;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const assets = Array.isArray(body.assets) ? body.assets : [];

    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }

    if (!message) {
      return c.json({ error: "message is required" }, 400);
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let closed = false;

        const send = (payload: Record<string, unknown>) => {
          if (closed) {
            return;
          }

          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } catch {
            closed = true;
          }
        };

        const close = () => {
          if (closed) {
            return;
          }

          closed = true;
          try {
            controller.close();
          } catch {
            // noop
          }
        };

        if (!process.env.ANTHROPIC_API_KEY) {
          send({ type: "error", message: "ANTHROPIC_API_KEY is not configured" });
          send({ type: "done" });
          close();
          return;
        }

        const history = sessionHistories.get(sessionId) ?? [];
        const userContent = buildUserMessage({ message, projectId, assets });
        const conversationHistory = trimHistory([
          ...history,
          { role: "user", content: userContent },
        ]);

        try {
          const system = await getSystemPrompt();
          const client = new Anthropic();
          const anthropicStream = client.messages.stream({
            model: MODEL,
            max_tokens: 4096,
            system,
            messages: conversationHistory,
          });

          let fullText = "";

          for await (const event of anthropicStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              fullText += event.delta.text;
              send({ type: "text", content: event.delta.text });
            }
          }

          const parsed = parseAiResponse(fullText);
          const nextHistory = trimHistory([
            ...conversationHistory,
            { role: "assistant", content: fullText },
          ]);
          sessionHistories.set(sessionId, nextHistory);

          if (parsed.scenes) {
            send({ type: "scenes", scenes: parsed.scenes });
          }

          if (parsed.audioTracks) {
            send({ type: "audioTracks", audioTracks: parsed.audioTracks });
          }

          send({ type: "message", content: parsed.message ?? "" });
          send({ type: "done" });
        } catch (error) {
          const messageText = error instanceof Error ? error.message : "Unknown AI chat error";
          send({ type: "error", message: messageText });
          send({ type: "done" });
        } finally {
          close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
