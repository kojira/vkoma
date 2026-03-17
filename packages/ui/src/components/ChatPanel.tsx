import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";

const TERMINAL_THEME = {
  background: "#141625",
  foreground: "#e6edf7",
  cursor: "#7dd3fc",
  cursorAccent: "#141625",
  selectionBackground: "rgba(125, 211, 252, 0.25)",
  black: "#141625",
  red: "#ff7b72",
  green: "#7ee787",
  yellow: "#f2cc60",
  blue: "#79c0ff",
  magenta: "#d2a8ff",
  cyan: "#7dd3fc",
  white: "#e6edf7",
  brightBlack: "#6e7681",
  brightRed: "#ffa198",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#a5d6ff",
  brightMagenta: "#e2b8ff",
  brightCyan: "#a5f3fc",
  brightWhite: "#f0f6fc",
} as const;

const SESSION_QUERY_KEY = "sessionId";

function getTerminalWsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/terminal-ws`;
}

function readSessionId() {
  return new URLSearchParams(window.location.search).get(SESSION_QUERY_KEY);
}

function writeSessionId(sessionId: string | null) {
  const url = new URL(window.location.href);
  if (sessionId) {
    url.searchParams.set(SESSION_QUERY_KEY, sessionId);
  } else {
    url.searchParams.delete(SESSION_QUERY_KEY);
  }
  window.history.replaceState({}, "", url);
}

export function ChatPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const sessionIdRef = useRef<string | null>(readSessionId());
  const compositionRef = useRef(false);
  const [resetCounter, setResetCounter] = useState(0);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const terminal = new Terminal({
      allowProposedApi: true,
      convertEol: true,
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Noto Sans Mono CJK JP", monospace',
      fontSize: 14,
      lineHeight: 1.35,
      theme: TERMINAL_THEME,
    });
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(container);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const sendResize = () => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      socket.send(
        JSON.stringify({
          type: "resize",
          cols: terminal.cols,
          rows: terminal.rows,
        }),
      );
    };

    const fitTerminal = () => {
      fitAddon.fit();
      sendResize();
    };

    const scheduleReconnect = () => {
      if (intentionalCloseRef.current || reconnectTimerRef.current !== null) {
        return;
      }

      const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30_000);
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        reconnectAttemptsRef.current += 1;
        connect();
      }, delay);
    };

    const handleMessage = (data: string) => {
      try {
        const payload = JSON.parse(data) as
          | { type: "session"; sessionId?: string }
          | { type: "replay-start" }
          | { type: "replay-end" }
          | { type: "exit"; code?: number };

        if (payload.type === "session") {
          sessionIdRef.current = payload.sessionId ?? null;
          writeSessionId(sessionIdRef.current);
          return;
        }

        if (payload.type === "replay-start") {
          terminal.clear();
          return;
        }

        if (payload.type === "replay-end") {
          return;
        }

        if (payload.type === "exit") {
          intentionalCloseRef.current = true;
          sessionIdRef.current = null;
          writeSessionId(null);
          setStatus("disconnected");
          terminal.writeln("");
          terminal.writeln(`Process exited${typeof payload.code === "number" ? ` (${payload.code})` : ""}.`);
          return;
        }
      } catch {
        terminal.write(data);
      }
    };

    const connect = () => {
      if (
        socketRef.current &&
        (socketRef.current.readyState === WebSocket.OPEN ||
          socketRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      clearReconnectTimer();
      intentionalCloseRef.current = false;
      setStatus("connecting");

      const url = new URL(getTerminalWsUrl());
      if (sessionIdRef.current) {
        url.searchParams.set(SESSION_QUERY_KEY, sessionIdRef.current);
      }

      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        reconnectAttemptsRef.current = 0;
        setStatus("connected");
        requestAnimationFrame(() => fitTerminal());
      });

      socket.addEventListener("message", (event) => {
        if (typeof event.data === "string") {
          handleMessage(event.data);
        }
      });

      socket.addEventListener("close", () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        setStatus("disconnected");
        if (!intentionalCloseRef.current) {
          scheduleReconnect();
        }
      });

      socket.addEventListener("error", () => {
        setStatus("disconnected");
      });
    };

    terminal.onData((data) => {
      if (compositionRef.current) {
        return;
      }

      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      socket.send(data);
    });

    const compositionContainer = container.querySelector(".xterm-helper-textarea");
    const handleCompositionStart = () => {
      compositionRef.current = true;
    };
    const handleCompositionEnd = () => {
      compositionRef.current = false;
    };

    compositionContainer?.addEventListener("compositionstart", handleCompositionStart);
    compositionContainer?.addEventListener("compositionend", handleCompositionEnd);

    resizeObserverRef.current = new ResizeObserver(() => {
      fitTerminal();
    });
    resizeObserverRef.current.observe(container);

    const handleWindowResize = () => fitTerminal();
    window.addEventListener("resize", handleWindowResize);

    requestAnimationFrame(() => {
      fitTerminal();
      connect();
    });

    return () => {
      intentionalCloseRef.current = true;
      clearReconnectTimer();
      writeSessionId(sessionIdRef.current);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      window.removeEventListener("resize", handleWindowResize);
      compositionContainer?.removeEventListener("compositionstart", handleCompositionStart);
      compositionContainer?.removeEventListener("compositionend", handleCompositionEnd);

      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        socket.close();
      }

      fitAddonRef.current = null;
      terminalRef.current = null;
      terminal.dispose();
    };
  }, [resetCounter]);

  return (
    <aside className="flex h-[24rem] w-full min-w-0 flex-col rounded-xl border border-gray-800 bg-[#141625] lg:h-full lg:w-80">
      <div className="border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-300">AI Terminal</h2>
            <p className="mt-1 text-xs text-gray-500">
              {status === "connected" ? "Connected" : status === "connecting" ? "Connecting..." : "Disconnected"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              intentionalCloseRef.current = true;
              sessionIdRef.current = null;
              writeSessionId(null);
              setResetCounter((value) => value + 1);
            }}
            className="rounded-md border border-gray-700 px-2.5 py-1 text-xs font-medium text-gray-300 transition hover:border-gray-500 hover:text-white"
          >
            New Chat
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 p-2">
        <div
          ref={containerRef}
          className="h-full w-full overflow-hidden rounded-lg border border-gray-900/80 bg-[#141625] p-2"
        />
      </div>
    </aside>
  );
}
