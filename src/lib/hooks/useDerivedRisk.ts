"use client";

import { useMemo } from "react";
import { useDesk } from "@/components/DeskContext";
import {
  applyOverlay,
  computePortfolio,
  hedgeEffectiveness,
  type PortfolioComputed,
} from "@/lib/calculations/portfolio";
import { useRiskStore } from "@/stores/riskStore";
import type {
  HedgeOverlayDefinition,
  PortfolioPreset,
  ScenarioDefinition,
} from "@/types/data";

export interface DerivedRisk {
  scenario: ScenarioDefinition;
  preset: PortfolioPreset;
  overlay: HedgeOverlayDefinition;
  /** Active weights: custom slider weights or the published preset. */
  weights: Record<string, number>;
  isCustom: boolean;
  pre: PortfolioComputed;
  postWeights: Record<string, number>;
  post: PortfolioComputed;
  effectiveness: number | null;
  overlayImpact: number;
  residualLoss: number;
}

/**
 * The single derived-state spine of the app. Every section reads from this,
 * so a scenario / portfolio / overlay change propagates everywhere at once.
 */
export function useDerivedRisk(): DerivedRisk {
  const data = useDesk();
  const {
    selectedScenarioId,
    selectedPortfolioId,
    customWeights,
    selectedOverlayId,
  } = useRiskStore();

  return useMemo(() => {
    const scenario =
      data.scenarios.find((s) => s.scenario_id === selectedScenarioId) ??
      data.scenarios[0];
    const preset =
      data.presets.find((p) => p.portfolio_id === selectedPortfolioId) ??
      data.presets[0];
    const overlay =
      data.overlays.find((o) => o.overlay_id === selectedOverlayId) ??
      data.overlays[0];

    const weights = customWeights ?? preset.weights;
    const pre = computePortfolio(
      weights,
      data.bonds,
      data.instrumentScenarioResults,
      scenario.scenario_id,
    );
    const postWeights = applyOverlay(weights, overlay);
    const post = computePortfolio(
      postWeights,
      data.bonds,
      data.instrumentScenarioResults,
      scenario.scenario_id,
    );

    return {
      scenario,
      preset,
      overlay,
      weights,
      isCustom: customWeights != null,
      pre,
      postWeights,
      post,
      effectiveness: hedgeEffectiveness(pre.pnlExact, post.pnlExact),
      overlayImpact: post.pnlExact - pre.pnlExact,
      residualLoss: post.pnlExact,
    };
  }, [data, selectedScenarioId, selectedPortfolioId, customWeights, selectedOverlayId]);
}
