"use client";

import { useEffect, useRef } from "react";

export function useHashTarget(readyKey: number | readonly { id: string }[]) {
  const lastFocused = useRef("");
  useEffect(() => {
    let frame: number;
    function reveal() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        let id: string;
        try {
          id = decodeURIComponent(window.location.hash.slice(1));
        } catch {
          id = "";
        }
        if (id === lastFocused.current) return;
        lastFocused.current = "";
        if (!id) return;
        const target = document.getElementById(id);
        if (!target) return;

        lastFocused.current = id;
        target.scrollIntoView({ block: "center" });
        target.focus({ preventScroll: true });
      });
    }
    reveal();
    window.addEventListener("hashchange", reveal);
    window.addEventListener("popstate", reveal);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", reveal);
      window.removeEventListener("popstate", reveal);
    };
  }, [readyKey]);
}
