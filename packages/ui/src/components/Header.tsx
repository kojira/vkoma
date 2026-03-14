export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-gray-800 bg-gray-950 px-6 py-4">
      <h1 className="text-xl font-semibold tracking-wide text-white">vKoma</h1>
      <button
        type="button"
        className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400"
      >
        Export
      </button>
    </header>
  );
}
