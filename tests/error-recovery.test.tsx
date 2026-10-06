import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlobalError from "@/app/global-error";
import ErrorPage from "@/app/[locale]/(app)/error";
import messages from "@/messages/es.json";
import {
  __resetSoundPreviewForTests,
  activeSoundPreviewCount,
  sharedAudioContextCreations,
  startSoundPreview,
} from "@/lib/audio/shared-preview";

const recovery = vi.hoisted(() => ({
  cleared: false,
  order: [] as string[],
}));

vi.mock("sonner", () => ({
  toast: {
    dismiss: () => {
      recovery.order.push("dismiss");
      recovery.cleared = true;
    },
    message: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

class Boundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <GlobalError
          error={this.state.error}
          reset={() => this.setState({ error: null })}
          retry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

function Fragile() {
  if (!recovery.cleared) {
    throw new Error("Cannot read properties of undefined (reading 'toastId')");
  }
  return <p>Planora lista</p>;
}

class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  resume = () => Promise.resolve();
  close = () => {
    this.state = "closed";
    return Promise.resolve();
  };
  createOscillator() {
    return {
      type: "sine",
      frequency: { setValueAtTime() {} },
      connect() {
        return this;
      },
      disconnect() {},
      start() {},
      stop() {},
      addEventListener() {},
    };
  }
  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() {
        return this;
      },
      disconnect() {},
    };
  }
}

beforeEach(() => {
  recovery.cleared = false;
  recovery.order = [];
  __resetSoundPreviewForTests();
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true })),
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  __resetSoundPreviewForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("error boundary recovery", () => {
  it("retries the global error screen without replaying the failed preview", async () => {
    const user = userEvent.setup();
    const started = startSoundPreview({ soundId: "soft" });
    expect(started.ok).toBe(true);
    expect(activeSoundPreviewCount()).toBe(1);
    const creations = sharedAudioContextCreations();

    render(
      <Boundary>
        <Fragile />
      </Boundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Algo ha salido mal");
    expect(
      screen.getByText("No se ha perdido ningún cambio guardado."),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Volver a intentarlo" }),
    );

    expect(screen.getByText("Planora lista")).toBeInTheDocument();
    expect(recovery.order[0]).toBe("dismiss");
    expect(activeSoundPreviewCount()).toBe(0);
    expect(sharedAudioContextCreations()).toBe(creations);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears transient state before the route error boundary retries", async () => {
    const user = userEvent.setup();
    const retry = vi.fn(() => {
      recovery.order.push("retry");
    });
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <ErrorPage error={new Error("render")} retry={retry} />
      </NextIntlClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(recovery.order).toEqual(["dismiss", "retry"]);
    expect(retry).toHaveBeenCalledOnce();
  });
});
