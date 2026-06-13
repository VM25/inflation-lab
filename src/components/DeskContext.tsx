"use client";

import { createContext, useContext } from "react";
import type { DeskData } from "@/types/data";

const DeskContext = createContext<DeskData | null>(null);

export function DeskProvider({
  data,
  children,
}: {
  data: DeskData;
  children: React.ReactNode;
}) {
  return <DeskContext.Provider value={data}>{children}</DeskContext.Provider>;
}

export function useDesk(): DeskData {
  const ctx = useContext(DeskContext);
  if (!ctx) throw new Error("useDesk must be used inside DeskProvider");
  return ctx;
}
