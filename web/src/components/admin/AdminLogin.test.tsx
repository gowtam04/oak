import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// All network goes through the auth-client; mock it so the box is a pure unit.
vi.mock("@/lib/api/auth-client", () => ({
  requestCode: vi.fn(),
  verifyCode: vi.fn(),
  signOut: vi.fn(),
}));

import { requestCode, signOut } from "@/lib/api/auth-client";
import AdminLogin from "./AdminLogin";

const mockRequestCode = vi.mocked(requestCode);
const mockSignOut = vi.mocked(signOut);

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("AdminLogin — guest", () => {
  it("shows only the email sign-in step (no chat, no admin chrome)", () => {
    render(<AdminLogin forbiddenEmail={null} />);
    expect(screen.getByTestId("admin-login")).toBeInTheDocument();
    expect(screen.getByTestId("admin-login-email-input")).toBeInTheDocument();
    expect(screen.getByTestId("admin-login-send-code")).toBeInTheDocument();
    // no forbidden notice, no admin shell
    expect(screen.queryByTestId("admin-login-forbidden")).toBeNull();
    expect(screen.queryByTestId("admin-shell")).toBeNull();
  });

  it("advances to the code step after a successful request-code", async () => {
    mockRequestCode.mockResolvedValue({ ok: true, status: 200 });
    render(<AdminLogin forbiddenEmail={null} />);

    fireEvent.change(screen.getByTestId("admin-login-email-input"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.submit(screen.getByTestId("admin-login-email-step"));

    await waitFor(() =>
      expect(screen.getByTestId("admin-login-code-step")).toBeInTheDocument(),
    );
    expect(mockRequestCode).toHaveBeenCalledWith("owner@example.com");
    expect(screen.getByTestId("admin-login-feedback")).toHaveTextContent(
      /sent a 6-digit code/i,
    );
  });

  it("rejects an obviously invalid email without a request", () => {
    render(<AdminLogin forbiddenEmail={null} />);
    fireEvent.change(screen.getByTestId("admin-login-email-input"), {
      target: { value: "not-an-email" },
    });
    fireEvent.submit(screen.getByTestId("admin-login-email-step"));
    expect(mockRequestCode).not.toHaveBeenCalled();
    expect(screen.getByTestId("admin-login-feedback")).toHaveAttribute(
      "data-error",
      "true",
    );
  });
});

describe("AdminLogin — signed-in non-admin", () => {
  it("shows a not-authorized notice with the email and a sign-out button (no form)", () => {
    render(<AdminLogin forbiddenEmail="user@example.com" />);
    const forbidden = screen.getByTestId("admin-login-forbidden");
    expect(forbidden).toHaveTextContent("user@example.com");
    expect(forbidden).toHaveTextContent(/not an authorized admin account/i);
    expect(screen.getByTestId("admin-login-signout")).toBeInTheDocument();
    // the email form is NOT shown in the forbidden state
    expect(screen.queryByTestId("admin-login-email-step")).toBeNull();
  });

  it("signs out then re-evaluates the session when the sign-out button is clicked", async () => {
    mockSignOut.mockResolvedValue();
    const onSessionChanged = vi.fn();
    render(
      <AdminLogin
        forbiddenEmail="user@example.com"
        onSessionChanged={onSessionChanged}
      />,
    );
    fireEvent.click(screen.getByTestId("admin-login-signout"));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSessionChanged).toHaveBeenCalledTimes(1));
  });
});
