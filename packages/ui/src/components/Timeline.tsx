export function Timeline() {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-950 px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white"
        >
          Play
        </button>
        <span className="text-sm text-gray-400">00:00 / 00:10</span>
      </div>
      <div className="ml-4 h-2 flex-1 rounded-full bg-gray-800">
        <div className="h-2 w-1/3 rounded-full bg-blue-500" />
      </div>
    </div>
  );
}
