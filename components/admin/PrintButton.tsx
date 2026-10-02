"use client";

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="ml-auto rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white">
      Print
    </button>
  );
}
