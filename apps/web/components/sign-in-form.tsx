"use client";

import { CircleXIcon, TriangleAlertIcon } from "lucide-react";
import {
  type FormEvent,
  type ReactElement,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
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
  signInTitle,
  tooManyAttemptsMessage,
  wrongCredentialsMessage,
} from "@/lib/copy";

// design/pages/sign-in: one message place above the form, focus moved to it when its text is set
// (no role="alert": sign-in has no live container, ia.md R2).

const SIGN_IN_ENDPOINT = "/api/auth/sign-in/email";
const STATUS_TOO_MANY_REQUESTS = 429;
// Better Auth answers 401 to wrong credentials and 400 to a malformed body; both read as AC4.
const CREDENTIAL_STATUSES = new Set([400, 401]);

type Message = "wrong-credentials" | "no-user" | "server-unreachable" | "too-many-attempts";

export interface SignInFormProps {
  /** Already validated on the server (safeNextPath). */
  next: string;
  signedOut: boolean;
  /** Whether no user exists at all (AC5); a server action. */
  needsSeedHint: () => Promise<boolean>;
  fetchImpl?: typeof fetch;
  navigate?: (path: string) => void;
}

export function SignInForm({
  next,
  signedOut,
  needsSeedHint,
  fetchImpl = (input, init) => fetch(input, init),
  navigate = (path) => window.location.assign(path),
}: SignInFormProps): ReactElement {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({ email: false, password: false });
  const [message, setMessage] = useState<{ kind: Message; shown: number } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // A ref, not state: a second Enter in the same tick must already see the request in flight.
  const inFlight = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const messageBox = useRef<HTMLDivElement>(null);

  // `shown` changes on every outcome, so the same message twice still takes focus.
  useEffect(() => {
    if (message !== null) messageBox.current?.focus();
  }, [message]);

  function show(kind: Message): void {
    setMessage((previous) => ({ kind, shown: (previous?.shown ?? 0) + 1 }));
  }

  async function credentialMessage(): Promise<Message> {
    try {
      return (await needsSeedHint()) ? "no-user" : "wrong-credentials";
    } catch {
      // The hint is optional help; without it the wrong-credentials message is still right.
      return "wrong-credentials";
    }
  }

  async function send(): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsBusy(true);
    setMessage(null);
    let outcome: Message;
    try {
      const response = await fetchImpl(SIGN_IN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        navigate(next);
        return;
      }
      if (CREDENTIAL_STATUSES.has(response.status)) outcome = await credentialMessage();
      else if (response.status === STATUS_TOO_MANY_REQUESTS) outcome = "too-many-attempts";
      else outcome = "server-unreachable";
    } catch {
      outcome = "server-unreachable";
    }
    if (outcome !== "server-unreachable") setPassword("");
    inFlight.current = false;
    setIsBusy(false);
    show(outcome);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (inFlight.current) return;
    const isEmailEmpty = email.trim() === "";
    const isPasswordEmpty = password === "";
    setFieldErrors({ email: isEmailEmpty, password: isPasswordEmpty });
    if (isEmailEmpty) {
      emailInput.current?.focus();
      return;
    }
    if (isPasswordEmpty) {
      passwordInput.current?.focus();
      return;
    }
    void send();
  }

  function retry(): void {
    // The retry button removes itself with the message; focus goes to the submit button (ia.md R2).
    submitButton.current?.focus();
    void send();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <h1 className="text-lg leading-7 font-semibold">{signInTitle}</h1>
        {signedOut ? <CardDescription>{signedOutNote}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {message === null ? null : (
          <MessageBox kind={message.kind} boxRef={messageBox} onRetry={retry} />
        )}
        {/* POST keeps the fields out of the URL if Enter submits the server-rendered form before
            hydration attaches onSubmit; a GET would put the password into history and Referer. */}
        <form method="post" noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="email">{emailLabel}</FieldLabel>
              <Input
                ref={emailInput}
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
              />
              {fieldErrors.email ? (
                <FieldErrorText id="email-error" text={emptyEmailError} />
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="password">{passwordLabel}</FieldLabel>
              <Input
                ref={passwordInput}
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
              />
              {fieldErrors.password ? (
                <FieldErrorText id="password-error" text={emptyPasswordError} />
              ) : null}
            </Field>
          </div>
          <Button
            ref={submitButton}
            type="submit"
            className="w-full"
            aria-disabled={isBusy ? true : undefined}
            aria-busy={isBusy ? true : undefined}
          >
            {isBusy ? <Spinner role="presentation" aria-hidden aria-label={undefined} /> : null}
            {isBusy ? signInBusyLabel : signInLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// Not shadcn's FieldError: it renders role="alert", and sign-in has no live container (ia.md R2).
function FieldErrorText({ id, text }: { id: string; text: string }): ReactElement {
  return (
    <p id={id} className="text-sm text-destructive">
      {text}
    </p>
  );
}

interface MessageBoxProps {
  kind: Message;
  boxRef: RefObject<HTMLDivElement | null>;
  onRetry: () => void;
}

function MessageBox({ kind, boxRef, onRetry }: MessageBoxProps): ReactElement {
  const isWarning = kind === "server-unreachable" || kind === "too-many-attempts";
  const title = {
    "wrong-credentials": wrongCredentialsMessage,
    "no-user": wrongCredentialsMessage,
    "server-unreachable": serverUnreachableMessage,
    "too-many-attempts": tooManyAttemptsMessage,
  }[kind];
  return (
    <Alert
      ref={boxRef}
      variant={isWarning ? "warning" : "destructive"}
      role="group"
      tabIndex={-1}
      aria-labelledby="sign-in-message-title"
      aria-describedby={kind === "no-user" ? "sign-in-message-description" : undefined}
    >
      {isWarning ? <TriangleAlertIcon aria-hidden /> : <CircleXIcon aria-hidden />}
      <AlertTitle id="sign-in-message-title">{title}</AlertTitle>
      {kind === "no-user" ? (
        <AlertDescription id="sign-in-message-description">{noUserHint}</AlertDescription>
      ) : null}
      {kind === "server-unreachable" ? (
        <div className="col-start-2 mt-2">
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      ) : null}
    </Alert>
  );
}
