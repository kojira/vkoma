import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useSceneStore } from "../stores/sceneStore";
import { useTimelineStore } from "../stores/timelineStore";
function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat("ja-JP", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}
export function ProjectSelector() {
    const createProject = useSceneStore((state) => state.createProject);
    const loadProject = useSceneStore((state) => state.loadProject);
    const [projects, setProjects] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        let cancelled = false;
        const fetchProjects = async () => {
            try {
                const response = await fetch("/api/projects");
                if (!response.ok) {
                    throw new Error("Failed to fetch projects");
                }
                const data = (await response.json());
                if (!cancelled) {
                    setProjects(Array.isArray(data.projects) ? data.projects : []);
                }
            }
            catch (error) {
                console.error(error);
                if (!cancelled) {
                    setProjects([]);
                }
            }
            finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };
        void fetchProjects();
        return () => {
            cancelled = true;
        };
    }, []);
    const handleCreateProject = async () => {
        const name = window.prompt("プロジェクト名を入力してください", "新規プロジェクト");
        if (!name?.trim()) {
            return;
        }
        await createProject(name.trim());
        const projectId = useSceneStore.getState().currentProjectId;
        if (projectId) {
            await useTimelineStore.getState().loadProject(projectId);
        }
    };
    return (_jsx("div", { className: "flex min-h-screen flex-col bg-gray-900 px-6 py-12 text-white", children: _jsxs("div", { className: "mx-auto flex w-full max-w-4xl flex-1 flex-col", children: [_jsxs("div", { className: "flex items-center justify-between gap-4 border-b border-gray-800 pb-6", children: [_jsxs("div", { children: [_jsx("div", { className: "text-sm uppercase tracking-[0.35em] text-gray-500", children: "Project Manager" }), _jsx("h1", { className: "mt-2 text-5xl font-bold tracking-tight text-white", children: "vKoma" })] }), _jsx("button", { type: "button", onClick: () => void handleCreateProject(), className: "rounded-md bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-400", children: "+ \u65B0\u898F\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8" })] }), _jsx("div", { className: "mt-8 flex-1", children: isLoading ? (_jsx("div", { className: "rounded-xl border border-gray-800 bg-gray-950/70 p-6 text-gray-400", children: "Loading projects..." })) : projects.length === 0 ? (_jsx("div", { className: "rounded-xl border border-dashed border-gray-700 bg-gray-950/70 p-10 text-center text-gray-400", children: "\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u65B0\u898F\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u3092\u4F5C\u6210\u3057\u3066\u304F\u3060\u3055\u3044\u3002" })) : (_jsx("div", { className: "space-y-3", children: projects.map((project) => (_jsxs("button", { type: "button", onClick: () => void Promise.all([
                                loadProject(project.id),
                                useTimelineStore.getState().loadProject(project.id),
                            ]), className: "flex w-full items-center justify-between rounded-xl border border-gray-800 bg-gray-950 px-5 py-4 text-left transition hover:border-blue-400 hover:bg-gray-900", children: [_jsxs("span", { children: [_jsx("span", { className: "block text-lg font-medium text-white", children: project.name }), _jsx("span", { className: "mt-1 block text-sm text-gray-400", children: project.id })] }), _jsx("span", { className: "text-sm text-gray-400", children: formatDate(project.updatedAt) })] }, project.id))) })) })] }) }));
}
