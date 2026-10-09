"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Seg } from "@/components/ui";
import { signIn, signUp, type AuthState } from "./actions";

type Mode = "signin" | "signup";

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  // useActionState runs the server action when the form is submitted and gives back
  // whatever it returned (an error or a message), plus a "pending" flag for the button.
  const [signInState, signInAction, signInPending] = useActionState<AuthState, FormData>(signIn, {});
  const [signUpState, signUpAction, signUpPending] = useActionState<AuthState, FormData>(signUp, {});
  const state = mode === "signin" ? signInState : signUpState;
  const pending = mode === "signin" ? signInPending : signUpPending;

  return (
    <div className="flex max-w-[420px] flex-col gap-6">
      <Seg<Mode>
        name="mode"
        label="Sign in or create an account"
        value={mode}
        onChange={setMode}
        options={[
          { value: "signin", label: "Sign in" },
          { value: "signup", label: "Create account" },
        ]}
      />

      <form action={mode === "signin" ? signInAction : signUpAction} className="flex flex-col gap-6">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" size="lg" defaultValue={state.email} required />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          hint={mode === "signup" ? "At least 8 characters." : undefined}
          error={state.error}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={8}
            size="lg"
            required
          />
        </Field>

        {state.message && (
          <p role="status" className="border-l-2 border-accent bg-accent-100 px-4 py-3 text-[14px] text-accent-800">
            {state.message}
          </p>
        )}

        <div>
          <Button type="submit" variant="primary" size="lg" spread className="min-w-[220px]" disabled={pending}>
            {pending ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"} <span aria-hidden>→</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
