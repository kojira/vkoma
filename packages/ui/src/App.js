import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChatPanel } from "./components/ChatPanel";
import { Header } from "./components/Header";
import { ParamPanel } from "./components/ParamPanel";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { Timeline } from "./components/Timeline";
export default function App() {
    return (_jsxs("div", { className: "min-h-screen bg-gray-900 text-white", children: [_jsx(Header, {}), _jsxs("main", { className: "flex flex-col gap-4 p-4 lg:flex-row", children: [_jsx(ParamPanel, {}), _jsxs("section", { className: "flex min-w-0 flex-1 flex-col gap-4", children: [_jsx(PreviewCanvas, {}), _jsx(Timeline, {})] }), _jsx(ChatPanel, {})] })] }));
}
