import { useEffect, useState } from "react";
import { useSceneStore } from "../stores/sceneStore";
import { useTimelineStore } from "../stores/timelineStore";

interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}

function formatDate(value: string) {
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
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchProjects = async () => {
      try {
        const response = await fetch("/api/projects");
        if (!response.ok) {
          throw new Error("Failed to fetch projects");
        }

        const data = (await response.json()) as { projects?: ProjectSummary[] };
        if (!cancelled) {
          setProjects(Array.isArray(data.projects) ? data.projects : []);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setProjects([]);
        }
      } finally {
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

  return (
    <div className="flex min-h-screen flex-col bg-gray-900 px-6 py-12 text-white">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-gray-800 pb-6">
          <div>
            <div className="text-sm uppercase tracking-[0.35em] text-gray-500">Project Manager</div>
            <h1 className="mt-2 text-5xl font-bold tracking-tight text-white">vKoma</h1>
          </div>
          <button
            type="button"
            onClick={() => void handleCreateProject()}
            className="rounded-md bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-400"
          >
            + 新規プロジェクト
          </button>
        </div>

        <div className="mt-8 flex-1">
          {isLoading ? (
            <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-6 text-gray-400">
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-700 bg-gray-950/70 p-10 text-center text-gray-400">
              プロジェクトがありません。新規プロジェクトを作成してください。
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() =>
                    void Promise.all([
                      loadProject(project.id),
                      useTimelineStore.getState().loadProject(project.id),
                    ])
                  }
                  className="flex w-full items-center justify-between rounded-xl border border-gray-800 bg-gray-950 px-5 py-4 text-left transition hover:border-blue-400 hover:bg-gray-900"
                >
                  <span>
                    <span className="block text-lg font-medium text-white">{project.name}</span>
                    <span className="mt-1 block text-sm text-gray-400">{project.id}</span>
                  </span>
                  <span className="text-sm text-gray-400">{formatDate(project.updatedAt)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
