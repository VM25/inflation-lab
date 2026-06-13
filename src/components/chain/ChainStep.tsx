"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * One link in the causal chain. The rail on the left binds the steps into
 * a single path; the kicker names the link in plain language. Steps carry
 * at most one control, placed where its consequence begins.
 */
export function ChainStep({
  id,
  kicker,
  children,
  last = false,
}: {
  id: string;
  kicker: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <section
      id={id}
      aria-label={kicker}
      className={`relative scroll-mt-14 pb-10 pl-6 sm:pl-9 ${
        last ? "" : "border-l border-rule-strong"
      }`}
    >
      {/* chain node */}
      <span
        aria-hidden
        className="absolute -left-[6.5px] top-[3px] h-3 w-3 rounded-full border-2 border-rule-strong bg-paper"
      />
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      >
        <p className="t-label mb-2.5">{kicker}</p>
        {children}
      </motion.div>
    </section>
  );
}
