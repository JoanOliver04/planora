"use client";
import { useRef, useState, type ReactNode } from "react";
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
import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical } from "lucide-react";

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
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  item: T;
  label: string;
  render: (item: T) => ReactNode;
  locale: "es" | "en";
  disabled?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
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
      <div className="sort-controls">
        <button
          className="drag-handle"
          disabled={disabled}
          aria-label={
            locale === "es" ? "Reordenar " + label : "Reorder " + label
          }
          {...attributes}
          {...listeners}
        >
          <GripVertical size={18} aria-hidden="true" />
        </button>
        <details
          className="sort-menu"
          onBlur={(event) => {
            if (
              event.relatedTarget &&
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              event.currentTarget.open = false;
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
        >
          <summary
            aria-label={
              locale === "es"
                ? `Cambiar posición de ${label}`
                : `Change position of ${label}`
            }
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : 0}
            onClick={(event) => {
              if (disabled) event.preventDefault();
            }}
          >
            <ArrowUpDown size={16} aria-hidden="true" />
          </summary>
          <div className="sort-menu-options">
            {([-1, 1] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                disabled={
                  disabled || (direction === -1 ? !canMoveUp : !canMoveDown)
                }
                onClick={(event) => {
                  const details = event.currentTarget.closest("details");
                  if (details) {
                    details.open = false;
                    details.querySelector("summary")?.focus();
                  }
                  onMove(direction);
                }}
              >
                {direction === -1 ? (
                  <ArrowUp size={16} aria-hidden="true" />
                ) : (
                  <ArrowDown size={16} aria-hidden="true" />
                )}
                {locale === "es"
                  ? direction === -1
                    ? "Subir"
                    : "Bajar"
                  : direction === -1
                    ? "Move up"
                    : "Move down"}
              </button>
            ))}
          </div>
        </details>
      </div>
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
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [announcement, setAnnouncement] = useState("");
  const itemById = new Map(initialItems.map((item) => [item.id, item]));
  const currentIds = initialItems.map((item) => item.id);
  const signature = currentIds.join("|");
  const [receivedSignature, setReceivedSignature] = useState(signature);
  if (!saving && receivedSignature !== signature) {
    setReceivedSignature(signature);
    setOrderedIds(currentIds);
  }
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
    if (disabled || savingRef.current) return;
    if (!event.over || event.active.id === event.over.id) return;
    const from = items.findIndex((item) => item.id === event.active.id);
    const to = items.findIndex((item) => item.id === event.over?.id);
    if (from < 0 || to < 0) return;
    const orderedIds = moveResourceIds(
      items.map((item) => item.id),
      String(event.active.id),
      String(event.over.id),
    );
    await persist(orderedIds);
  }
  async function persist(next: string[]) {
    if (disabled || savingRef.current) return;
    const previous = items.map((item) => item.id);
    savingRef.current = true;
    setSaving(true);
    setOrderedIds(next);
    setAnnouncement("");
    try {
      await onCommit(next);
      setAnnouncement(
        locale === "es" ? "Orden actualizado." : "Order updated.",
      );
    } catch {
      setOrderedIds(previous);
      onError();
    } finally {
      savingRef.current = false;
      setSaving(false);
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
          {items.map((item, index) => (
            <SortableItem
              key={item.id}
              item={item}
              label={getLabel(item)}
              render={renderItem}
              locale={locale}
              disabled={disabled || saving}
              canMoveUp={index > 0}
              canMoveDown={index < items.length - 1}
              onMove={(direction) => {
                const target = items[index + direction];
                if (target)
                  void persist(
                    moveResourceIds(
                      items.map((item) => item.id),
                      item.id,
                      target.id,
                    ),
                  );
              }}
            />
          ))}
        </div>
        <span className="sr-only" role="status">
          {announcement}
        </span>
      </SortableContext>
    </DndContext>
  );
}
