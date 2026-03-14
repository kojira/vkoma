import { ChatPanel } from "./components/ChatPanel";
import { Header } from "./components/Header";
import { ParamPanel } from "./components/ParamPanel";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { ProjectSelector } from "./components/ProjectSelector";
import { Timeline } from "./components/Timeline";
import { useSceneStore } from "./stores/sceneStore";

export default function App() {
  const currentProjectId = useSceneStore((state) => state.currentProjectId);

  if (currentProjectId === null) {
    return <ProjectSelector />;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Header />
      <main className="flex flex-col gap-4 p-4 lg:flex-row">
        <ParamPanel />
        <section className="flex min-w-0 flex-1 flex-col gap-4">
          <PreviewCanvas />
          <Timeline />
        </section>
        <ChatPanel />
      </main>
    </div>
  );
}
