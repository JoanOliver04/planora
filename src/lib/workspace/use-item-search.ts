"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export function useItemSearch(items: readonly { id: string; title: string }[]) {
  const params = useSearchParams();
  const itemId = params.get("item");
  const initialQuery = params.get("q") ?? "";
  const source = itemId ? `item:${itemId}` : `q:${initialQuery}`;
  const [edit, setEdit] = useState<{ source: string; value: string } | null>(
    null,
  );
  const draft = edit?.source === source ? edit.value : undefined;
  const selectedId = draft === undefined ? itemId : null;
  const query =
    draft ??
    (itemId
      ? (items.find((item) => item.id === itemId)?.title ?? "")
      : initialQuery);
  return {
    query,
    selectedId,
    fromLink: Boolean(itemId || initialQuery),
    setQuery: (value: string) => setEdit({ source, value }),
  };
}
