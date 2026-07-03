/**
 * AuthDialog — jsdom component tests (account-creation design.md § Phase 6 /
 * § Implementation Phases "Phase 6 — Frontend auth UI", test_focus "two-step
 * dialog states").
 *
 * These exercise the REAL `@/lib/api/auth-client` over a mocked global `fetch`, so a
 * single suite covers both the fetch→result mapping AND every dialog branch. No
 * server modules are imported (jsdom project rule). Each negative branch asserts
 * the feedback discriminant via the `data-kind` attribute — never happy-path only.
 *
 * Requirement coverage: AC-2.1 (email step + send), AC-2.2 / BR-A1
 * (non-enumerating), AC-2.3 / AC-2.4 (created flag), AC-2.5 (invalid_code +
 * attemptsRemaining), AC-2.6 (expired/used), BR-A4 (too_many_attempts), AC-2.7
 * (change email), AC-3.1 (resend cooldown), AC-3.3 / BR-A6 (rate_limited).
 */

import {
  afterEach,
  beforeEach,
  describe,
  it,
  expect,
  vi,
  type Mock,
} from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";

import AuthDialog from "./AuthDialog";

// ---------------------------------------------------------------------------
// fetch stub (real auth-client runs against it)
// ---------------------------------------------------------------------------

/** Minimal `Response`-shaped stub matching what auth-client reads. */
function mockResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => lower[k.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderDialog() {
  const onSignedIn = vi.fn();
  const onClose = vi.fn();
  render(<AuthDialog open onClose={onClose} onSignedIn={onSignedIn} />);
  return { onSignedIn, onClose };
}

/** Drive the email step with a successful request-code → land on the code step. */
async function gotoCodeStep(email = "ash@pallet.town") {
  fetchMock.mockResolvedValueOnce(mockResponse(200, { ok: true }));
  fireEvent.change(screen.getByTestId("auth-email-input"), {
    target: { value: email },
  });
  fireEvent.submit(screen.getByTestId("auth-email-step"));
  await screen.findByTestId("auth-code-step");
}

// ---------------------------------------------------------------------------
// Email step
// ---------------------------------------------------------------------------

describe("AuthDialog — email step (AC-2.1)", () => {
  it("renders the email step first and hides the code step", () => {
    renderDialog();
    expect(screen.getByTestId("auth-email-step")).toBeInTheDocument();
    expect(screen.queryByTestId("auth-code-step")).not.toBeInTheDocument();
  });

  it("returns null when open is false", () => {
    const { container } = render(
      <AuthDialog open={false} onClose={vi.fn()} onSignedIn={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("rejects a syntactically invalid email WITHOUT calling the API (AC-2.1)", () => {
    renderDialog();
    fireEvent.change(screen.getByTestId("auth-email-input"), {
      target: { value: "not-an-email" },
    });
    fireEvent.submit(screen.getByTestId("auth-email-step"));
    expect(screen.getByTestId("auth-feedback")).toHaveAttribute(
      "data-kind",
      "invalid_email",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("auth-code-step")).not.toBeInTheDocument();
  });

  it("advances to the code step on a successful request-code, posting the email (AC-2.1)", async () => {
    renderDialog();
    await gotoCodeStep("ash@pallet.town");
    expect(screen.getByTestId("auth-feedback")).toHaveAttribute(
      "data-kind",
      "code_sent",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/api/auth/request-code");
    expect(JSON.parse(String(init.body))).toEqual({ email: "ash@pallet.town" });
  });

  it("is NON-ENUMERATING: a successful send shows a generic message that never reveals registration (AC-2.2 / BR-A1)", async () => {
    renderDialog();
    await gotoCodeStep();
    const fb = screen.getByTestId("auth-feedback");
    expect(fb).toHaveAttribute("data-kind", "code_sent");
    // No copy hints whether the account already existed.
    expect((fb.textContent ?? "").toLowerCase()).not.toMatch(
      /exist|registered|already|new account|sign ?up|created/,
    );
  });

  it("maps a server 400 invalid_email → invalid_email feedback and stays on the email step", async () => {
    renderDialog();
    fetchMock.mockResolvedValueOnce(
      mockResponse(400, { code: "invalid_email", message: "x" }),
    );
    fireEvent.change(screen.getByTestId("auth-email-input"), {
      target: { value: "ash@pallet.town" },
    });
    fireEvent.submit(screen.getByTestId("auth-email-step"));
    const fb = await screen.findByTestId("auth-feedback");
    expect(fb).toHaveAttribute("data-kind", "invalid_email");
    expect(screen.queryByTestId("auth-code-step")).not.toBeInTheDocument();
  });

  it("maps a 429 → rate_limited feedback (AC-3.3 / BR-A6)", async () => {
    renderDialog();
    fetchMock.mockResolvedValueOnce(
      mockResponse(
        429,
        { code: "rate_limited", message: "x" },
        { "Retry-After": "30" },
      ),
    );
    fireEvent.change(screen.getByTestId("auth-email-input"), {
      target: { value: "ash@pallet.town" },
    });
    fireEvent.submit(screen.getByTestId("auth-email-step"));
    const fb = await screen.findByTestId("auth-feedback");
    expect(fb).toHaveAttribute("data-kind", "rate_limited");
    expect(screen.queryByTestId("auth-code-step")).not.toBeInTheDocument();
  });

  it("maps a 502 email_failed → email_failed feedback and stays on the email step", async () => {
    renderDialog();
    fetchMock.mockResolvedValueOnce(
      mockResponse(502, { code: "email_failed", message: "x" }),
    );
    fireEvent.change(screen.getByTestId("auth-email-input"), {
      target: { value: "ash@pallet.town" },
    });
    fireEvent.submit(screen.getByTestId("auth-email-step"));
    const fb = await screen.findByTestId("auth-feedback");
    expect(fb).toHaveAttribute("data-kind", "email_failed");
    expect(screen.queryByTestId("auth-code-step")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Code step — verify branches
// ---------------------------------------------------------------------------

describe("AuthDialog — code step verify branches", () => {
  it("verifies a correct code for a NEW email → onSignedIn({created:true}) (AC-2.3)", async () => {
    const { onSignedIn } = renderDialog();
    await gotoCodeStep("ash@pallet.town");
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        ok: true,
        email: "ash@pallet.town",
        created: true,
      }),
    );
    fireEvent.change(screen.getByTestId("auth-code-input"), {
      target: { value: "123456" },
    });
    fireEvent.submit(screen.getByTestId("auth-code-step"));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(onSignedIn).toHaveBeenCalledWith({ created: true });

    const verifyCall = fetchMock.mock.calls.find(([u]) =>
      String(u).includes("/api/auth/verify"),
    ) as [string, RequestInit] | undefined;
    expect(verifyCall).toBeTruthy();
    expect(JSON.parse(String(verifyCall![1].body))).toEqual({
      email: "ash@pallet.town",
      code: "123456",
    });
  });

  it("verifies a correct code for an EXISTING email → onSignedIn({created:false}) (AC-2.4)", async () => {
    const { onSignedIn } = renderDialog();
    await gotoCodeStep();
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        ok: true,
        email: "ash@pallet.town",
        created: false,
      }),
    );
    fireEvent.change(screen.getByTestId("auth-code-input"), {
      target: { value: "654321" },
    });
    fireEvent.submit(screen.getByTestId("auth-code-step"));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith({ created: false }));
  });

  it("wrong code → invalid_code feedback with attemptsRemaining, no sign-in, retry allowed (AC-2.5)", async () => {
    const { onSignedIn } = renderDialog();
    await gotoCodeStep();
    fetchMock.mockResolvedValueOnce(
      mockResponse(400, {
        code: "invalid_code",
        message: "x",
        attemptsRemaining: 3,
      }),
    );
    fireEvent.change(screen.getByTestId("auth-code-input"), {
      target: { value: "000000" },
    });
    fireEvent.submit(screen.getByTestId("auth-code-step"));
    const fb = await screen.findByTestId("auth-feedback");
    expect(fb).toHaveAttribute("data-kind", "invalid_code");
    expect(fb).toHaveTextContent("3 attempts remaining");
    expect(onSignedIn).not.toHaveBeenCalled();
    // Still on the code step so the user can retry until lockout.
    expect(screen.getByTestId("auth-code-step")).toBeInTheDocument();
  });

  it("expired / already-used code → expired feedback, no sign-in (AC-2.6)", async () => {
    const { onSignedIn } = renderDialog();
    await gotoCodeStep();
    fetchMock.mockResolvedValueOnce(
      mockResponse(400, { code: "invalid_or_expired", message: "x" }),
    );
    fireEvent.change(screen.getByTestId("auth-code-input"), {
      target: { value: "999999" },
    });
    fireEvent.submit(screen.getByTestId("auth-code-step"));
    const fb = await screen.findByTestId("auth-feedback");
    expect(fb).toHaveAttribute("data-kind", "expired");
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("locked-out code → too_many feedback, no sign-in (BR-A4)", async () => {
    const { onSignedIn } = renderDialog();
    await gotoCodeStep();
    fetchMock.mockResolvedValueOnce(
      mockResponse(400, { code: "too_many_attempts", message: "x" }),
    );
    fireEvent.change(screen.getByTestId("auth-code-input"), {
      target: { value: "123456" },
    });
    fireEvent.submit(screen.getByTestId("auth-code-step"));
    const fb = await screen.findByTestId("auth-feedback");
    expect(fb).toHaveAttribute("data-kind", "too_many");
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("per-IP verify throttle → rate_limited feedback, no sign-in", async () => {
    const { onSignedIn } = renderDialog();
    await gotoCodeStep();
    fetchMock.mockResolvedValueOnce(
      mockResponse(
        429,
        { code: "rate_limited", message: "x" },
        { "Retry-After": "30" },
      ),
    );
    fireEvent.change(screen.getByTestId("auth-code-input"), {
      target: { value: "123456" },
    });
    fireEvent.submit(screen.getByTestId("auth-code-step"));
    const fb = await screen.findByTestId("auth-feedback");
    expect(fb).toHaveAttribute("data-kind", "rate_limited");
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Code step — change email + resend cooldown
// ---------------------------------------------------------------------------

describe("AuthDialog — change email + resend (AC-2.7, AC-3.1)", () => {
  it("change-email goes back to the email step (AC-2.7)", async () => {
    renderDialog();
    await gotoCodeStep();
    fireEvent.click(screen.getByTestId("auth-change-email"));
    expect(screen.getByTestId("auth-email-step")).toBeInTheDocument();
    expect(screen.queryByTestId("auth-code-step")).not.toBeInTheDocument();
  });

  it("disables resend during the cooldown and re-enables it after it elapses (AC-3.1)", async () => {
    vi.useFakeTimers();

    const onSignedIn = vi.fn();
    render(<AuthDialog open onClose={vi.fn()} onSignedIn={onSignedIn} />);

    fetchMock.mockResolvedValueOnce(mockResponse(200, { ok: true }));
    fireEvent.change(screen.getByTestId("auth-email-input"), {
      target: { value: "ash@pallet.town" },
    });
    fireEvent.submit(screen.getByTestId("auth-email-step"));

    // Drain the fetch→json→setState microtask chain under fake timers
    // (findBy/waitFor can't be used — they poll on real timers).
    for (let i = 0; i < 6; i++) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(screen.getByTestId("auth-code-step")).toBeInTheDocument();
    // Cooldown active: resend disabled, countdown shows the full 60s.
    expect(screen.getByTestId("auth-resend")).toBeDisabled();
    expect(screen.getByTestId("auth-resend-countdown")).toHaveTextContent("60");

    // One second elapses → counts down, still disabled.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("auth-resend-countdown")).toHaveTextContent("59");
    expect(screen.getByTestId("auth-resend")).toBeDisabled();

    // Full cooldown elapses → countdown gone, resend enabled.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(
      screen.queryByTestId("auth-resend-countdown"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-resend")).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// OTP segmented cells (UI §4 screen 08) — ONE real input drives six visual
// cells; paste/backspace are exercised through that single input exactly like
// native browser behavior (a paste delivers the whole new value in one
// change event, same as typing).
// ---------------------------------------------------------------------------

describe("AuthDialog — OTP segmented cells", () => {
  it("renders six empty cells with the first cell active once the code step is focused", async () => {
    renderDialog();
    await gotoCodeStep();
    const input = screen.getByTestId("auth-code-input");
    await waitFor(() => expect(input).toHaveFocus());

    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`auth-otp-cell-${i}`)).toHaveTextContent("");
    }
    expect(screen.getByTestId("auth-otp-cell-0")).toHaveClass(
      "auth-dialog__otp-cell--active",
    );
    expect(screen.getByTestId("auth-otp-cell-1")).not.toHaveClass(
      "auth-dialog__otp-cell--active",
    );
  });

  it("reflects typed digits into filled cells and advances the active cell", async () => {
    renderDialog();
    await gotoCodeStep();
    const input = screen.getByTestId("auth-code-input");
    await waitFor(() => expect(input).toHaveFocus());

    fireEvent.change(input, { target: { value: "12" } });
    expect(screen.getByTestId("auth-otp-cell-0")).toHaveTextContent("1");
    expect(screen.getByTestId("auth-otp-cell-1")).toHaveTextContent("2");
    expect(screen.getByTestId("auth-otp-cell-2")).toHaveTextContent("");
    expect(screen.getByTestId("auth-otp-cell-0")).toHaveClass(
      "auth-dialog__otp-cell--filled",
    );
    // The active ring follows the next empty slot, not a filled one.
    expect(screen.getByTestId("auth-otp-cell-2")).toHaveClass(
      "auth-dialog__otp-cell--active",
    );
    expect(screen.getByTestId("auth-otp-cell-1")).not.toHaveClass(
      "auth-dialog__otp-cell--active",
    );
  });

  it("fills all six cells from a single paste-shaped change event, non-digits stripped", async () => {
    renderDialog();
    await gotoCodeStep();
    const input = screen.getByTestId("auth-code-input");

    // A real paste delivers the whole new value in one change event — same
    // shape as this synthetic one — so this exercises the paste path.
    fireEvent.change(input, { target: { value: "12-345 6" } });
    expect((input as HTMLInputElement).value).toBe("123456");
    for (const [i, digit] of ["1", "2", "3", "4", "5", "6"].entries()) {
      expect(screen.getByTestId(`auth-otp-cell-${i}`)).toHaveTextContent(
        digit,
      );
      expect(screen.getByTestId(`auth-otp-cell-${i}`)).toHaveClass(
        "auth-dialog__otp-cell--filled",
      );
    }
    // No cell index matches a full 6-digit code, so none shows the active ring.
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`auth-otp-cell-${i}`)).not.toHaveClass(
        "auth-dialog__otp-cell--active",
      );
    }
  });

  it("backspacing shrinks the value and the active cell steps back with it", async () => {
    renderDialog();
    await gotoCodeStep();
    const input = screen.getByTestId("auth-code-input");
    await waitFor(() => expect(input).toHaveFocus());

    fireEvent.change(input, { target: { value: "123456" } });
    // Backspace removes the last character — browsers deliver this as a
    // change event with the shortened value.
    fireEvent.change(input, { target: { value: "12345" } });
    expect(screen.getByTestId("auth-otp-cell-5")).toHaveTextContent("");
    expect(screen.getByTestId("auth-otp-cell-5")).toHaveClass(
      "auth-dialog__otp-cell--active",
    );
    expect(screen.getByTestId("auth-otp-cell-4")).toHaveTextContent("5");
  });
});

// ---------------------------------------------------------------------------
// Dismissal
// ---------------------------------------------------------------------------

describe("AuthDialog — dismissal", () => {
  it("calls onClose from the close button and the backdrop, but not the panel", () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByTestId("auth-close"));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("auth-dialog-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);

    // Clicking inside the panel must not bubble to a close.
    fireEvent.click(screen.getByTestId("auth-dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
