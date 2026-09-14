"use client";

import { Fragment } from "react";
import { tokenize } from "@/lib/linkify";

/**
 * Renders message text with links, emails and phone numbers made tappable.
 *
 * Builds React elements rather than HTML, so nothing in a message is ever
 * parsed as markup — a message containing <script> stays text. The
 * matching itself lives in lib/linkify, which has its own tests.
 */
export default function RichText({ text, mine }: { text: string; mine: boolean }) {
  if (!text) return null;

  return (
    <>
      {tokenize(text).map((t, i) =>
        t.type === "link" ? (
          <a
            key={i}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={(e) => e.stopPropagation()}
            className={`underline decoration-1 underline-offset-2 transition hover:opacity-80 ${
              mine ? "text-pink-100" : "text-[var(--color-accent-soft)]"
            }`}
          >
            {t.value}
          </a>
        ) : (
          <Fragment key={i}>{t.value}</Fragment>
        ),
      )}
    </>
  );
}
