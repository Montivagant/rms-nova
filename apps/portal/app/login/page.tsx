"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, FormField, Input } from "@nova/design-system";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error?.message ?? "Login failed");
        return;
      }
      const next = searchParams.get("next") ?? "/";
      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="portal-page" style={{ maxWidth: 420, margin: "0 auto" }}>
      <h2>Sign in</h2>
      <p className="text-muted">Use your tenant credentials to access the customer portal.</p>
      <form className="portal-card__section" onSubmit={onSubmit}>
        <FormField label="Email" required>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="founder@example.com"
          />
        </FormField>
        <FormField label="Password" required>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </FormField>
        {error ? (
          <div className="badge badge--warning" style={{ alignSelf: "flex-start" }}>
            {error}
          </div>
        ) : null}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
