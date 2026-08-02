"use client";
import { useState, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

export function moveResourceIds(
  ids: string[],
  activeId: string,
  overId: string,
) {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  return from < 0 || to < 0 ? ids : arrayMove(ids, from, to);
}

function SortableItem<T extends { id: string }>({
  item,
  label,
  render,
  locale,
  disabled,
}: {
  item: T;
  label: string;
  render: (item: T) => ReactNode;
  locale: "es" | "en";
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled });
  return (
    <div
      ref={setNodeRef}
      className="sortable-resource"
      data-dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        className="drag-handle"
        disabled={disabled}
        aria-label={locale === "es" ? "Reordenar " + label : "Reorder " + label}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} />
      </button>
      <div className="sortable-content">{render(item)}</div>
    </div>
  );
}

export function SortableResourceList<T extends { id: string }>({
  items: initialItems,
  renderItem,
  getLabel,
  onCommit,
  onError,
  locale,
  className = "",
  disabled = false,
}: {
  items: T[];
  renderItem: (item: T) => ReactNode;
  getLabel: (item: T) => string;
  onCommit: (ids: string[]) => Promise<void>;
  onError: () => void;
  locale: "es" | "en";
  className?: string;
  disabled?: boolean;
}) {
  const [orderedIds, setOrderedIds] = useState(() =>
    initialItems.map((item) => item.id),
  );
  const itemById = new Map(initialItems.map((item) => [item.id, item]));
  const currentIds = initialItems.map((item) => item.id);
  const visibleIds = [
    ...orderedIds.filter((id) => itemById.has(id)),
    ...currentIds.filter((id) => !orderedIds.includes(id)),
  ];
  const items = visibleIds.map((id) => itemById.get(id)!);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  async function finished(event: DragEndEvent) {
    if (disabled) return;
    if (!event.over || event.active.id === event.over.id) return;
    const previous = items;
    const from = items.findIndex((item) => item.id === event.active.id);
    const to = items.findIndex((item) => item.id === event.over?.id);
    if (from < 0 || to < 0) return;
    const orderedIds = moveResourceIds(
      items.map((item) => item.id),
      String(event.active.id),
      String(event.over.id),
    );
    const orderedItemById = new Map(items.map((item) => [item.id, item]));
    const next = orderedIds.map((id) => orderedItemById.get(id)!);
    setOrderedIds(next.map((item) => item.id));
    try {
      await onCommit(next.map((item) => item.id));
    } catch {
      setOrderedIds(previous.map((item) => item.id));
      onError();
    }
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event) => void finished(event)}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            locale === "es"
              ? "Pulsa espacio para levantar. Usa las flechas para mover y espacio para soltar."
              : "Press space to pick up. Use arrow keys to move and space to drop.",
        },
      }}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={rectSortingStrategy}
      >
        <div className={className}>
          {items.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              label={getLabel(item)}
              render={renderItem}
              locale={locale}
              disabled={disabled}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
