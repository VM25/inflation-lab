import { create } from "zustand";

export type RepricingView = "duration" | "convexity" | "exact";
export type StochasticModelView = "vasicek" | "cir" | "both";

interface RiskState {
  selectedScenarioId: string;
  selectedPortfolioId: string;
  /** Custom fader weights; null means "use the book as published". */
  customWeights: Record<string, number> | null;
  selectedOverlayId: string;
  hedgeView: "pre" | "post";
  repricingView: RepricingView;
  stochasticModel: StochasticModelView;
  setScenario: (id: string) => void;
  setPortfolio: (id: string) => void;
  setCustomWeights: (w: Record<string, number> | null) => void;
  setOverlay: (id: string) => void;
  setHedgeView: (v: "pre" | "post") => void;
  setRepricingView: (v: RepricingView) => void;
  setStochasticModel: (v: StochasticModelView) => void;
}

/**
 * The chain opens on its strongest finding: the measured 2022 inflation
 * replay against the classic long-duration hedge book, with the duration
 * reduction overlay staged for the hedge step.
 */
export const useRiskStore = create<RiskState>((set) => ({
  selectedScenarioId: "replay_2022",
  selectedPortfolioId: "long_duration_hedge_book",
  customWeights: null,
  selectedOverlayId: "duration_reduction",
  hedgeView: "pre",
  repricingView: "exact",
  stochasticModel: "both",
  setScenario: (id) => set({ selectedScenarioId: id }),
  // changing book resets custom weights so downstream steps stay coherent
  setPortfolio: (id) => set({ selectedPortfolioId: id, customWeights: null }),
  setCustomWeights: (w) => set({ customWeights: w }),
  setOverlay: (id) => set({ selectedOverlayId: id }),
  setHedgeView: (v) => set({ hedgeView: v }),
  setRepricingView: (v) => set({ repricingView: v }),
  setStochasticModel: (v) => set({ stochasticModel: v }),
}));
