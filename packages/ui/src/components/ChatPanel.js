import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
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
};
const SESSION_QUERY_KEY = "sessionId";
const FONT_SIZE_STORAGE_KEY = "vkoma-terminal-font-size";
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 24;
const MOBILE_CONTROL_KEYS = [
    [
        { id: "shift", label: "⇧" },
        { id: "ctrl", label: "Ctrl" },
        { id: "enter", label: "Enter" },
        { id: "tab", label: "Tab" },
        { id: "esc", label: "Esc" },
        { id: "ctrl-c", label: "Ctrl+C" },
    ],
    [
        { id: "pgup", label: "PgUp" },
        { id: "left", label: "←" },
        { id: "up", label: "↑" },
        { id: "down", label: "↓" },
        { id: "right", label: "→" },
        { id: "pgdn", label: "PgDn" },
        { id: "y", label: "Y" },
        { id: "n", label: "N" },
    ],
];
const MOBILE_CONTROL_KEY_MAP = {
    enter: "\r",
    tab: "\t",
    esc: "\x1b",
    "ctrl-c": "\x03",
    left: "\x1b[D",
    up: "\x1b[A",
    down: "\x1b[B",
    right: "\x1b[C",
    y: "y",
    n: "n",
};
function getDefaultFontSize() {
    if (typeof window === "undefined") {
        return 14;
    }
    const saved = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    if (saved) {
        const parsed = Number.parseInt(saved, 10);
        if (parsed >= FONT_SIZE_MIN && parsed <= FONT_SIZE_MAX) {
            return parsed;
        }
    }
    return window.innerWidth <= 768 ? 12 : 14;
}
function getTerminalWsUrl() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/terminal-ws`;
}
function readSessionId() {
    return new URLSearchParams(window.location.search).get(SESSION_QUERY_KEY);
}
function writeSessionId(sessionId) {
    const url = new URL(window.location.href);
    if (sessionId) {
        url.searchParams.set(SESSION_QUERY_KEY, sessionId);
    }
    else {
        url.searchParams.delete(SESSION_QUERY_KEY);
    }
    window.history.replaceState({}, "", url);
}
export function ChatPanel() {
    const containerRef = useRef(null);
    const terminalRef = useRef(null);
    const fitAddonRef = useRef(null);
    const socketRef = useRef(null);
    const resizeObserverRef = useRef(null);
    const reconnectTimerRef = useRef(null);
    const reconnectAttemptsRef = useRef(0);
    const intentionalCloseRef = useRef(false);
    const sessionIdRef = useRef(readSessionId());
    const compositionRef = useRef(false);
    const hasSavedFontSizeRef = useRef(typeof window !== "undefined" ? window.localStorage.getItem(FONT_SIZE_STORAGE_KEY) !== null : false);
    const [resetCounter, setResetCounter] = useState(0);
    const [status, setStatus] = useState("connecting");
    const [imeValue, setImeValue] = useState("");
    const [shiftActive, setShiftActive] = useState(false);
    const [ctrlActive, setCtrlActive] = useState(false);
    const [fontSize, setFontSize] = useState(getDefaultFontSize);
    const applyShiftModifier = useCallback((data) => {
        if (!shiftActive) {
            return data;
        }
        switch (data) {
            case "\x1b[A":
                return "\x1b[1;2A";
            case "\x1b[B":
                return "\x1b[1;2B";
            case "\x1b[C":
                return "\x1b[1;2C";
            case "\x1b[D":
                return "\x1b[1;2D";
            default:
                return /^[ -~]$/.test(data) ? data.toUpperCase() : data;
        }
    }, [shiftActive]);
    const toCtrlCharacter = useCallback((data) => String.fromCharCode(data.toUpperCase().charCodeAt(0) - 64), []);
    const applyCtrlModifier = useCallback((data) => {
        if (!ctrlActive) {
            return data;
        }
        switch (data) {
            case "\x1b[A":
                return "\x1b[1;5A";
            case "\x1b[B":
                return "\x1b[1;5B";
            case "\x1b[C":
                return "\x1b[1;5C";
            case "\x1b[D":
                return "\x1b[1;5D";
            default:
                return /^[A-Za-z]$/.test(data) ? toCtrlCharacter(data) : data;
        }
    }, [ctrlActive, toCtrlCharacter]);
    const sendSocketData = useCallback((data) => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return false;
        }
        socket.send(data);
        return true;
    }, []);
    const sendControlKey = useCallback((key) => {
        if (key === "pgup") {
            terminalRef.current?.scrollPages(-1);
            terminalRef.current?.focus();
            return;
        }
        if (key === "pgdn") {
            terminalRef.current?.scrollPages(1);
            terminalRef.current?.focus();
            return;
        }
        const data = MOBILE_CONTROL_KEY_MAP[key];
        if (!data) {
            return;
        }
        sendSocketData(applyCtrlModifier(applyShiftModifier(data)));
        terminalRef.current?.focus();
    }, [applyCtrlModifier, applyShiftModifier, sendSocketData]);
    const sendImeInput = useCallback(() => {
        const text = imeValue;
        if (!text) {
            return;
        }
        let output = shiftActive ? text.toUpperCase() : text;
        if (ctrlActive) {
            output = output
                .split("")
                .map((char) => (/^[A-Za-z]$/.test(char) ? toCtrlCharacter(char) : char))
                .join("");
        }
        const terminal = terminalRef.current;
        if (terminal) {
            terminal.paste(`${output}\n`);
        }
        else if (!sendSocketData(`${output}\n`)) {
            return;
        }
        terminalRef.current?.focus();
        setImeValue("");
    }, [ctrlActive, imeValue, sendSocketData, shiftActive, toCtrlCharacter]);
    const changeFontSize = useCallback((delta) => {
        setFontSize((current) => {
            const next = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, current + delta));
            if (next === current) {
                return current;
            }
            hasSavedFontSizeRef.current = true;
            window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(next));
            return next;
        });
    }, []);
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
            fontSize,
            lineHeight: 1.35,
            theme: TERMINAL_THEME,
        });
        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(webLinksAddon);
        terminalRef.current = terminal;
        fitAddonRef.current = fitAddon;
        let terminalOpened = false;
        let dimensionObserver = null;
        let rafId = null;
        let compositionContainer = null;
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
            socket.send(JSON.stringify({
                type: "resize",
                cols: terminal.cols,
                rows: terminal.rows,
            }));
        };
        const fitTerminal = () => {
            if (!terminalOpened) {
                return;
            }
            try {
                fitAddon.fit();
            }
            catch {
                // dimensions not ready yet
            }
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
        const handleMessage = (data) => {
            try {
                const payload = JSON.parse(data);
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
            }
            catch {
                terminal.write(data);
            }
        };
        const connect = () => {
            if (socketRef.current &&
                (socketRef.current.readyState === WebSocket.OPEN ||
                    socketRef.current.readyState === WebSocket.CONNECTING)) {
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
        const handleCompositionStart = () => {
            compositionRef.current = true;
        };
        const handleCompositionEnd = () => {
            compositionRef.current = false;
        };
        resizeObserverRef.current = new ResizeObserver(() => {
            if (terminalOpened) {
                fitTerminal();
            }
        });
        resizeObserverRef.current.observe(container);
        const handleWindowResize = () => {
            fitTerminal();
            if (!hasSavedFontSizeRef.current) {
                setFontSize(window.innerWidth <= 768 ? 12 : 14);
            }
        };
        window.addEventListener("resize", handleWindowResize);
        const openTerminal = () => {
            if (terminalOpened) {
                return;
            }
            terminalOpened = true;
            compositionContainer = container.querySelector(".xterm-helper-textarea");
            compositionContainer?.addEventListener("compositionstart", handleCompositionStart);
            compositionContainer?.addEventListener("compositionend", handleCompositionEnd);
        };
        const openTerminalAndConnect = () => {
            if (terminalOpened) {
                return;
            }
            if (container.offsetWidth > 0 && container.offsetHeight > 0) {
                terminal.open(container);
                openTerminal();
                fitTerminal();
                connect();
                return;
            }
            if (dimensionObserver) {
                return;
            }
            dimensionObserver = new ResizeObserver(() => {
                if (container.offsetWidth > 0 && container.offsetHeight > 0) {
                    dimensionObserver?.disconnect();
                    dimensionObserver = null;
                    terminal.open(container);
                    openTerminal();
                    fitTerminal();
                    connect();
                }
            });
            dimensionObserver.observe(container);
        };
        rafId = requestAnimationFrame(openTerminalAndConnect);
        return () => {
            intentionalCloseRef.current = true;
            clearReconnectTimer();
            writeSessionId(sessionIdRef.current);
            if (rafId !== null) {
                window.cancelAnimationFrame(rafId);
            }
            dimensionObserver?.disconnect();
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
    useEffect(() => {
        const terminal = terminalRef.current;
        if (!terminal) {
            return;
        }
        if (terminal.options.fontSize !== fontSize) {
            terminal.options.fontSize = fontSize;
            fitAddonRef.current?.fit();
            const socket = socketRef.current;
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: "resize",
                    cols: terminal.cols,
                    rows: terminal.rows,
                }));
            }
        }
    }, [fontSize]);
    return (_jsxs("aside", { className: "flex h-full w-full min-w-0 flex-col rounded-xl border border-gray-800 bg-[#141625] pb-12 lg:h-full lg:w-80 md:pb-0", children: [_jsx("div", { className: "border-b border-gray-800 px-3 py-2 lg:px-4 lg:py-3", children: _jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h2", { className: "text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-300 lg:text-sm", children: "AI Terminal" }), _jsx("p", { className: "mt-1 hidden text-xs text-gray-500 lg:block", children: status === "connected" ? "Connected" : status === "connecting" ? "Connecting..." : "Disconnected" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("div", { className: "flex items-center gap-1 rounded-md border border-gray-800 bg-[#141625] p-0.5 lg:p-1", children: [_jsx("button", { type: "button", onClick: () => changeFontSize(-1), className: "flex min-h-[28px] w-7 items-center justify-center rounded border border-gray-700 text-xs text-gray-300 transition hover:border-gray-500 hover:text-white lg:min-h-[32px] lg:w-8 lg:text-sm", "aria-label": "Decrease terminal font size", children: "-" }), _jsx("span", { className: "min-w-7 text-center text-[10px] text-gray-400 lg:min-w-8 lg:text-xs", children: fontSize }), _jsx("button", { type: "button", onClick: () => changeFontSize(1), className: "flex min-h-[28px] w-7 items-center justify-center rounded border border-gray-700 text-xs text-gray-300 transition hover:border-gray-500 hover:text-white lg:min-h-[32px] lg:w-8 lg:text-sm", "aria-label": "Increase terminal font size", children: "+" })] }), _jsx("button", { type: "button", onClick: () => {
                                        intentionalCloseRef.current = true;
                                        sessionIdRef.current = null;
                                        writeSessionId(null);
                                        setResetCounter((value) => value + 1);
                                    }, className: "rounded-md border border-gray-700 px-2 py-0.5 text-[10px] font-medium text-gray-300 transition hover:border-gray-500 hover:text-white lg:px-2.5 lg:py-1 lg:text-xs", children: "New Chat" })] })] }) }), _jsx("div", { className: "flex-1 min-h-0 overflow-hidden p-2", children: _jsx("div", { ref: containerRef, className: "h-full w-full overflow-hidden rounded-lg border border-gray-900/80 bg-[#141625] p-2" }) }), _jsx("div", { className: "flex-shrink-0 p-1.5 md:hidden", children: _jsxs("div", { className: "flex items-center gap-1.5 rounded-lg border border-gray-800 bg-[#141625] p-1.5", children: [_jsx("input", { type: "text", value: imeValue, onChange: (event) => setImeValue(event.target.value), onKeyDown: (event) => {
                                if (event.key !== "Enter" || event.nativeEvent.isComposing) {
                                    return;
                                }
                                event.preventDefault();
                                sendImeInput();
                            }, placeholder: "IME\u5165\u529B / Type here...", autoComplete: "off", autoCapitalize: "off", spellCheck: false, className: "min-h-[32px] flex-1 rounded-md border border-gray-800 bg-[#1a1d31] px-2 text-xs text-gray-200 outline-none transition focus:border-[#7dd3fc]/50 focus:ring-2 focus:ring-[#7dd3fc]/15" }), _jsx("button", { type: "button", onClick: sendImeInput, className: "min-h-[32px] rounded-md bg-[#7dd3fc] px-3 text-xs font-medium text-[#08111d] transition hover:brightness-105 active:translate-y-px", children: "Send" })] }) }), _jsx("div", { className: "flex-shrink-0 border-t border-gray-800 bg-[#141625] p-1.5 md:hidden", children: _jsx("div", { className: "flex gap-1 overflow-x-auto", children: MOBILE_CONTROL_KEYS.flat().map((button) => {
                        const isShift = button.id === "shift";
                        const isCtrl = button.id === "ctrl";
                        const isActive = (isShift && shiftActive) || (isCtrl && ctrlActive);
                        return (_jsx("button", { type: "button", onClick: () => {
                                if (isShift) {
                                    setShiftActive((value) => !value);
                                    return;
                                }
                                if (isCtrl) {
                                    setCtrlActive((value) => !value);
                                    return;
                                }
                                sendControlKey(button.id);
                            }, className: [
                                "min-h-[28px] flex-shrink-0 rounded-lg border border-gray-800 bg-white/5 px-2 py-0.5 text-[10px] text-gray-300 transition active:bg-white/10",
                                "touch-manipulation",
                                isShift && isActive
                                    ? "border-[rgba(125,211,252,0.5)] bg-[rgba(125,211,252,0.25)] text-[#7dd3fc]"
                                    : "",
                                isCtrl && isActive
                                    ? "border-[rgba(126,231,135,0.5)] bg-[rgba(126,231,135,0.25)] text-[#7ee787]"
                                    : "",
                            ]
                                .filter(Boolean)
                                .join(" "), children: button.label }, button.id));
                    }) }) })] }));
}
