import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emailLabel,
  emptyEmailError,
  emptyPasswordError,
  noUserHint,
  passwordLabel,
  retryLabel,
  serverUnreachableMessage,
  signedOutNote,
  signInBusyLabel,
  signInLabel,
  tooManyAttemptsMessage,
  wrongCredentialsMessage,
} from "@/lib/copy";
import { SignInForm } from "./sign-in-form";

const NEXT = "/courses/a/lessons/b?tab=checks";
const EMAIL = "learner@example.com";
const PASSWORD = "correct horse battery";

function setup({
  fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 })),
  needsSeedHint = vi.fn(async () => false),
  signedOut = false,
} = {}) {
  const navigate = vi.fn((_path: string) => {});
  render(
    <SignInForm
      next={NEXT}
      signedOut={signedOut}
      needsSeedHint={needsSeedHint}
      fetchImpl={fetchImpl}
      navigate={navigate}
    />,
  );
  return { fetchImpl, navigate, needsSeedHint };
}

function fill(email: string, password: string): void {
  fireEvent.change(screen.getByLabelText(emailLabel), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(passwordLabel), { target: { value: password } });
}

function submitButton(): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^(${signInLabel}|${signInBusyLabel})$`) });
}

function submit(): void {
  fireEvent.submit(submitButton().closest("form") ?? document.body);
}

function respondWith(status: number) {
  return vi.fn<typeof fetch>(async () => new Response(null, { status }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SignInForm AC2: empty fields", () => {
  it("sends nothing, marks both fields and focuses the email field when both are empty", () => {
    const { fetchImpl } = setup();

    submit();

    expect(fetchImpl).not.toHaveBeenCalled();
    const email = screen.getByLabelText(emailLabel);
    expect(screen.getByText(emptyEmailError)).toBeInTheDocument();
    expect(screen.getByText(emptyPasswordError)).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", "email-error");
    expect(email).toHaveFocus();
  });

  it("focuses the password field when only the password is empty", () => {
    const { fetchImpl } = setup();
    fill(EMAIL, "");

    submit();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(screen.queryByText(emptyEmailError)).not.toBeInTheDocument();
    expect(screen.getByLabelText(passwordLabel)).toHaveFocus();
  });
});

describe("SignInForm AC3: in flight", () => {
  it("shows the busy label, is aria-disabled but never disabled, and sends once on a second submit", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    setup({ fetchImpl });
    fill(EMAIL, PASSWORD);

    submit();
    submit();

    const button = await screen.findByRole("button", { name: signInBusyLabel });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).not.toHaveAttribute("disabled");
    // jsdom applies no Tailwind CSS, so the class list is the cheap check that the busy button keeps
    // proto.css's muted pair; the e2e AC3 test compares the computed colours, hovered included.
    expect(button).toHaveClass("aria-disabled:bg-muted", "aria-disabled:text-muted-foreground");
    fireEvent.click(button);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("SignInForm AC4: wrong credentials", () => {
  it("shows the message in a focused group without role=alert, keeps the email and clears the password", async () => {
    setup({ fetchImpl: respondWith(401) });
    fill(EMAIL, PASSWORD);

    submit();

    const message = (await screen.findByText(wrongCredentialsMessage)).closest("[data-slot=alert]");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(message).toHaveAttribute("role", "group");
    expect(message).toHaveAccessibleName(wrongCredentialsMessage);
    // The message takes focus in an effect after it renders, so a loaded runner can see it first.
    await waitFor(() => expect(message).toHaveFocus());
    expect(message).not.toHaveAttribute("aria-describedby");
    expect(screen.getByLabelText(emailLabel)).toHaveValue(EMAIL);
    expect(screen.getByLabelText(passwordLabel)).toHaveValue("");
  });
});

describe("SignInForm AC5: no user", () => {
  it("adds the seed hint inside the message, described by it", async () => {
    setup({ fetchImpl: respondWith(401), needsSeedHint: vi.fn(async () => true) });
    fill(EMAIL, PASSWORD);

    submit();

    const message = await screen.findByRole("group", { name: wrongCredentialsMessage });
    expect(message).toHaveAccessibleDescription(noUserHint);
    await waitFor(() => expect(message).toHaveFocus());
  });
});

describe("SignInForm AC6: server unreachable", () => {
  it.each([
    {
      kind: "a network failure",
      fetchImpl: vi.fn<typeof fetch>(async () => Promise.reject(new TypeError("offline"))),
    },
    { kind: "status 500", fetchImpl: respondWith(500) },
  ])(
    "shows the server message and the retry button after $kind, keeping both fields",
    async ({ fetchImpl }) => {
      setup({ fetchImpl });
      fill(EMAIL, PASSWORD);

      submit();

      const message = await screen.findByRole("group", { name: serverUnreachableMessage });
      await waitFor(() => expect(message).toHaveFocus());
      expect(screen.getByRole("button", { name: retryLabel })).toBeInTheDocument();
      expect(screen.getByLabelText(passwordLabel)).toHaveValue(PASSWORD);
    },
  );

  it("re-sends the same values on retry and moves focus to the submit button", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockImplementationOnce(() => new Promise<Response>(() => {}));
    setup({ fetchImpl });
    fill(EMAIL, PASSWORD);
    submit();

    const message = await screen.findByRole("group", { name: serverUnreachableMessage });
    // The message takes focus in a passive effect. A Retry click before that effect runs lets the
    // stale effect move focus back to the message, which Retry then removes, so focus lands on body (#157).
    await waitFor(() => expect(message).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: retryLabel }));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    expect(fetchImpl.mock.calls[1]?.[1]?.body).toBe(fetchImpl.mock.calls[0]?.[1]?.body);
    expect(screen.getByRole("button", { name: signInBusyLabel })).toHaveFocus();
  });
});

describe("SignInForm AC7: rate limited", () => {
  it("shows the neutral message without a number", async () => {
    setup({ fetchImpl: respondWith(429) });
    fill(EMAIL, PASSWORD);

    submit();

    const message = await screen.findByRole("group", { name: tooManyAttemptsMessage });
    expect(message.textContent).not.toMatch(/\d/);
  });
});

describe("SignInForm AC8, AC9", () => {
  it("navigates to next after a successful sign-in", async () => {
    const { navigate, fetchImpl } = setup();
    fill(EMAIL, PASSWORD);

    await act(async () => {
      submit();
    });

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(NEXT));
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/auth/sign-in/email");
  });

  it.each([
    { signedOut: true, shown: true },
    { signedOut: false, shown: false },
  ])("shows the signed-out note only when signed out: $signedOut", ({ signedOut, shown }) => {
    setup({ signedOut });

    expect(screen.queryByText(signedOutNote) !== null).toBe(shown);
  });
});

describe("SignInForm before hydration", () => {
  it("renders a POST form without an action, so an early Enter keeps the password out of the URL", () => {
    const html = renderToString(
      <SignInForm
        next={NEXT}
        signedOut={false}
        needsSeedHint={vi.fn(async () => false)}
        fetchImpl={vi.fn<typeof fetch>()}
        navigate={vi.fn()}
      />,
    );

    const form = new DOMParser().parseFromString(html, "text/html").querySelector("form");

    expect(form?.getAttribute("method")).toBe("post");
    expect(form?.hasAttribute("action")).toBe(false);
  });
});
