"use client";

import { useEffect } from "react";
import { Hook } from "@/components/chain/Hook";
import { TallyBar } from "@/components/chain/TallyBar";
import { BeyondStep } from "@/components/chain/steps/BeyondStep";
import { BookStep } from "@/components/chain/steps/BookStep";
import { DamageStep } from "@/components/chain/steps/DamageStep";
import { EventStep } from "@/components/chain/steps/EventStep";
import { GapStep } from "@/components/chain/steps/GapStep";
import { HedgeStep } from "@/components/chain/steps/HedgeStep";
import { LedgerStep } from "@/components/chain/steps/LedgerStep";
import { NotesStep } from "@/components/chain/steps/NotesStep";

/**
 * The whole engine is one causal chain, walked top to bottom:
 * shock, book, damage, gap, hedge, ledger, distribution. Each link owns
 * at most one control, placed where its consequence begins; the tally bar
 * carries the running state so every click has a visible answer.
 */
export function Chain() {
  // Steps mount after the data fetch, so honor deep links once they exist.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <div className="min-h-[100dvh]">
      <TallyBar />
      <main className="mx-auto max-w-[1200px] px-4 pb-24 sm:px-6 lg:px-8">
        <Hook />
        <EventStep />
        <BookStep />
        <DamageStep />
        <GapStep />
        <HedgeStep />
        <LedgerStep />
        <BeyondStep />
        <NotesStep />
      </main>
    </div>
  );
}
