import { ChatPanel } from "./components/ChatPanel";
import { Header } from "./components/Header";
import { ParamPanel } from "./components/ParamPanel";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { Timeline } from "./components/Timeline";

export default function App() {
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
