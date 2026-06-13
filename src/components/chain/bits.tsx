"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { fmtSignedUsd } from "@/lib/formatters/numberFormatters";

/* ------------------------------------------------------------------ */
/* Roll: the engine's only live-update primitive.                      */
/*                                                                     */
/* Width and height are reserved by invisible ghosts of the longest    */
/* possible values, so a token can never reflow its sentence, card or  */
/* section. The old value rolls out and the new one rolls in along the */
/* direction of change: numbers roll up when they increase, scenario   */
/* names roll in scenario order. Only the token moves.                 */
/* ------------------------------------------------------------------ */

const ROLL_T = { duration: 0.5, ease: [0.23, 1, 0.32, 1] as const };

export function Roll({
  text,
  order = 0,
  ghosts,
  tone,
  align = "left",
  block = false,
  className = "",
}: {
  text: string;
  /** ordering index or numeric value; sets the roll direction */
  order?: number;
  /** candidate strings that reserve the slot's width (longest wins) */
  ghosts?: string[];
  tone?: "loss" | "gain" | "hedge" | "ink" | "dim";
  align?: "left" | "right" | "center";
  /** multi-line token: fills the container, reserves the tallest ghost */
  block?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const prev = useRef(order);
  const dirRef = useRef(1);
  if (order !== prev.current) {
    dirRef.current = order > prev.current ? 1 : -1;
    prev.current = order;
  }
  const dir = dirRef.current;
  const tones = {
    loss: "text-loss",
    gain: "text-gain",
    hedge: "text-hedge",
    ink: "text-ink",
    dim: "text-ink-3",
  };

  return (
    <span
      className={`roll ${block ? "roll-block" : ""} ${tone ? tones[tone] : ""} ${className}`}
      data-align={align}
    >
      {(ghosts && ghosts.length ? ghosts : [text]).map((g) => (
        <span key={g} aria-hidden className="roll-ghost">
          {g}
        </span>
      ))}
      <span className="roll-win">
        <AnimatePresence initial={false}>
          <motion.span
            key={text}
            className="roll-item"
            initial={reduced ? false : { y: `${dir * 110}%`, opacity: 0.3 }}
            animate={{ y: "0%", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { y: `${-dir * 110}%`, opacity: 0.25 }}
            transition={ROLL_T}
          >
            {text}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}

/** Signed P&L token: rolls with the direction of the move. */
export function LivePnl({
  value,
  reserve = "-$888,888",
  align = "left",
  className = "",
}: {
  value: number;
  reserve?: string;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <Roll
      text={fmtSignedUsd(value)}
      order={value}
      ghosts={[reserve]}
      tone={value < 0 ? "loss" : value > 0 ? "gain" : "dim"}
      align={align}
      className={`t-data font-medium ${className}`}
    />
  );
}

/** Generic live value, kept for short tokens with stable width. */
export function Live({
  children,
  tone,
  className = "",
}: {
  children: React.ReactNode;
  tone?: "loss" | "gain" | "hedge" | "ink";
  className?: string;
}) {
  const tones = { loss: "text-loss", gain: "text-gain", hedge: "text-hedge", ink: "text-ink" };
  return (
    <span
      key={String(children)}
      className={`t-data tick font-medium ${tone ? tones[tone] : ""} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * TokenChip: a named subject slot in a claim sentence. The chip's width is
 * fixed by the longest candidate, so switching from "Bull Flattener" to
 * "Long-End Term Premium Shock" never re-wraps the heading. The trailing
 * glyph slot fills the reserved space with meaning.
 */
export function TokenChip({
  text,
  order = 0,
  ghosts,
  glyph,
  className = "",
}: {
  text: string;
  order?: number;
  ghosts: string[];
  glyph?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`tok ${className}`}>
      <Roll text={text} order={order} ghosts={ghosts} className="min-w-0" />
      {glyph ? <span className="tok-glyph shrink-0 opacity-90">{glyph}</span> : null}
    </span>
  );
}

/**
 * Subject line: the entities this link is about. Chips sit on their own
 * line above the claim, so their reserved width never opens gaps inside
 * a sentence.
 */
export function Subject({ items }: { items: React.ReactNode[] }) {
  return (
    <div className="subject mb-1.5 font-[family-name:var(--font-label)] text-[14px] font-semibold text-ink sm:text-[15px]">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-[10px]">
          {i > 0 && (
            <span aria-hidden className="text-[12px] font-normal text-ink-3">
              ×
            </span>
          )}
          {it}
        </span>
      ))}
    </div>
  );
}

/** The claim: one sentence stating what this link shows, numbers live. */
export function Claim({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-display max-w-[820px] text-[18px] leading-[1.5] text-ink sm:text-[21px] sm:leading-[1.5]">
      {children}
    </p>
  );
}

/** Panel head: quiet, mixed-case. */
export function PanelHead({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-rule px-4 py-2.5">
      <p className="t-label text-ink-2">{title}</p>
      {right ? <div className="t-note text-right">{right}</div> : null}
    </div>
  );
}

/** Quiet operational footnote. */
export function Footnote({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-[70ch] text-[12.5px] leading-relaxed text-ink-3">{children}</p>
  );
}

/** Marks the one control that drives this link. */
export function ControlCue({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-label mb-2 flex items-center gap-1.5 text-ink-2">
      <span aria-hidden className="inline-block h-[6px] w-[6px] rounded-full bg-hedge" />
      {children}
    </p>
  );
}
