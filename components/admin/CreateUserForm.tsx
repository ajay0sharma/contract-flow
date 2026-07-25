"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPlatformUserAction } from "@/app/actions/admin";
import type { PlatformRole } from "@/lib/platform-config";

const roleOptions: Array<{ value: PlatformRole; label: string }> = [
  { value: "business", label: "General user" },
  { value: "legal", label: "Legal user" },
  { value: "support", label: "Support user" },
  { value: "admin", label: "Admin" },
];

export function CreateUserForm() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<PlatformRole>("business");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const created = await createPlatformUserAction({
          firstName,
          lastName,
          email,
          password,
          role,
        });

        setMessage(`Created user ${created.email}.`);
        router.refresh();
        setFirstName("");
        setLastName("");
        setEmail("");
        setPassword("");
        setRole("business");
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to create user.",
        );
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-base font-semibold text-stone-900">Create user</h2>
      <p className="mt-1 text-sm text-stone-600">
        Creates a Clerk account and registers the user in the platform role
        directory as a general user, support user, legal user, or admin.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-stone-700">First name</span>
          <input
            type="text"
            required
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-stone-700">Last name</span>
          <input
            type="text"
            required
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="font-medium text-stone-700">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-stone-700">Temporary password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-stone-700">Platform role</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as PlatformRole)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {message ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="mt-4 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
      >
        {isPending ? "Creating..." : "Create user"}
      </button>
    </form>
  );
}
