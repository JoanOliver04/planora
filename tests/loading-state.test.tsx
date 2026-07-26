import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";

describe("workspace loading state", () => {
  it("renders a contextual skeleton instead of a plain loading card", () => {
    const { container } = render(<WorkspaceSkeleton />);
    expect(screen.getByLabelText("Loading")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(container.querySelectorAll(".skeleton-task")).toHaveLength(3);
  });
});
