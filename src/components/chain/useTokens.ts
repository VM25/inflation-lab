"use client";

import { useMemo } from "react";
import { useDesk } from "@/components/DeskContext";

/**
 * Ghost candidates and ordering for every rolling token family.
 * Ghosts reserve slot width (longest value wins); orders set the
 * direction a token rolls when it changes.
 */
export function useTokens() {
  const { scenarios, presets, overlays } = useDesk();

  return useMemo(() => {
    const scenarioNames = scenarios.map((s) => s.name);
    const bookNames = presets.map((p) => p.name);
    const overlayNames = overlays.map((o) => o.name.replace(" Overlay", ""));
    return {
      scenarioNames,
      bookNames,
      overlayNames,
      scenarioOrder: (id: string) =>
        scenarios.findIndex((s) => s.scenario_id === id),
      bookOrder: (id: string) => presets.findIndex((p) => p.portfolio_id === id),
      overlayOrder: (id: string) => overlays.findIndex((o) => o.overlay_id === id),
    };
  }, [scenarios, presets, overlays]);
}
