"use client";

import { useEffect, useState } from "react";
import { Chain } from "@/components/chain/Chain";
import { DeskProvider } from "@/components/DeskContext";
import { loadDeskData } from "@/lib/data/loaders";
import type { DeskData } from "@/types/data";

export default function Page() {
  const [data, setData] = useState<DeskData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDeskData()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <main className="grid min-h-[100dvh] place-items-center p-8">
        <div className="panel max-w-md p-7">
          <p className="t-label mb-2 text-loss">Data fault</p>
          <p className="text-[13px] leading-relaxed text-ink-2">
            A required data file failed to load ({error}). Regenerate the
            static data, then reload:
          </p>
          <p className="t-data field mt-3 px-3 py-2 text-[12px] text-ink">
            python3 research/scripts/run_pipeline.py
          </p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="grid min-h-[100dvh] place-items-center" aria-busy="true">
        <div className="text-center">
          <p className="t-display animate-pulse text-[17px] text-ink">
            Loading the chain
          </p>
          <p className="t-note mt-1">reading data manifest</p>
        </div>
      </main>
    );
  }

  return (
    <DeskProvider data={data}>
      <Chain />
    </DeskProvider>
  );
}
