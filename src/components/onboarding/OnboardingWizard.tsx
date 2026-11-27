"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { errorText, inputClass, mutedText, primaryButton } from "@/components/ui/styles";
import { fromDateInputValue } from "@/lib/member-format";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";

const STEPS = ["Name your tree", "Add yourself", "Invite family"] as const;

function splitName(name: string | null): { first: string; last: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0]!, last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1]! };
}

function Progress({ step }: { step: number }) {
  return (
    <ol className="mb-8 flex gap-2" aria-label="Onboarding progress">
      {STEPS.map((label, index) => {
        const state = index < step ? "done" : index === step ? "current" : "todo";
        return (
          <li key={label} className="flex-1" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={`block h-1.5 rounded-full ${
                state === "todo" ? "bg-gray-200 dark:bg-gray-800" : "bg-emerald-600"
              }`}
            />
            <span className={`mt-2 block text-xs ${state === "current" ? "font-medium" : mutedText}`}>
              {index + 1}. {label}
              {state === "done" && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ErrorLine({ error }: { error: { message: string; data?: { code?: string } | null } | null }) {
  return error ? (
    <p role="alert" className={errorText}>
      {getErrorMessage(error)}
    </p>
  ) : null;
}

export function OnboardingWizard({
  name,
  initialStep,
  initialTreeId,
}: {
  name: string | null;
  initialStep: number;
  initialTreeId: string | null;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { first, last } = splitName(name);
  const [step, setStep] = useState(initialStep);
  const [treeId, setTreeId] = useState(initialTreeId);

  const [treeName, setTreeName] = useState(last ? `${last} Family` : "");
  const [member, setMember] = useState({ firstName: first, lastName: last, birthDate: "" });
  const [invite, setInvite] = useState({ email: "", role: "EDITOR" as "EDITOR" | "VIEWER" });

  const advance = trpc.users.advanceOnboarding.useMutation();
  const createTree = trpc.trees.create.useMutation();
  const addMember = trpc.members.add.useMutation();
  const sendInvite = trpc.invitations.send.useMutation();

  const finish = async (id: string) => {
    await advance.mutateAsync({ step: 3 });
    void utils.users.me.invalidate();
    router.push(`/tree/${id}` as Route);
  };

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Welcome to FamilyForest</h1>
      <p className={`mb-6 ${mutedText}`}>Three quick steps and your tree is ready.</p>
      <Progress step={step} />

      {step === 0 && (
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const tree = await createTree.mutateAsync({ name: treeName.trim() }).catch(() => null);
            if (!tree) return;
            await advance.mutateAsync({ step: 1 });
            setTreeId(tree.id);
            setStep(1);
          }}
        >
          <label className="block space-y-1">
            <span className="text-lg font-medium">What would you like to call your family tree?</span>
            <input
              value={treeName}
              onChange={(event) => setTreeName(event.target.value)}
              required
              maxLength={100}
              placeholder="The Smith Family"
              className={inputClass}
              autoFocus
            />
          </label>
          <ErrorLine error={createTree.error} />
          <button type="submit" disabled={createTree.isPending || !treeName.trim()} className={primaryButton}>
            {createTree.isPending && <Spinner />}
            Continue
          </button>
        </form>
      )}

      {step === 1 && treeId && (
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const added = await addMember
              .mutateAsync({
                treeId,
                firstName: member.firstName.trim(),
                lastName: member.lastName.trim(),
                birthDate: member.birthDate ? fromDateInputValue(member.birthDate) : undefined,
                isSelf: true,
              })
              .catch(() => null);
            if (!added) return;
            await advance.mutateAsync({ step: 2 });
            setStep(2);
          }}
        >
          <fieldset className="space-y-4">
            <legend className="text-lg font-medium">Add yourself as the first member</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm font-medium">First name</span>
                <input
                  value={member.firstName}
                  onChange={(event) => setMember((m) => ({ ...m, firstName: event.target.value }))}
                  required
                  maxLength={100}
                  autoComplete="given-name"
                  className={inputClass}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Last name</span>
                <input
                  value={member.lastName}
                  onChange={(event) => setMember((m) => ({ ...m, lastName: event.target.value }))}
                  required
                  maxLength={100}
                  autoComplete="family-name"
                  className={inputClass}
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">
                Birth date <span className={mutedText}>(optional)</span>
              </span>
              <input
                type="date"
                value={member.birthDate}
                onChange={(event) => setMember((m) => ({ ...m, birthDate: event.target.value }))}
                className={inputClass}
              />
            </label>
          </fieldset>
          <ErrorLine error={addMember.error} />
          <button
            type="submit"
            disabled={addMember.isPending || !member.firstName.trim() || !member.lastName.trim()}
            className={primaryButton}
          >
            {addMember.isPending && <Spinner />}
            Continue
          </button>
        </form>
      )}

      {step === 2 && treeId && (
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const sent = await sendInvite
              .mutateAsync({ treeId, email: invite.email.trim(), role: invite.role })
              .catch(() => null);
            if (sent) await finish(treeId);
          }}
        >
          <fieldset className="space-y-4">
            <legend className="text-lg font-medium">Invite one family member</legend>
            <p className={mutedText}>They&apos;ll get an email with a link to join your tree.</p>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Their email</span>
              <input
                type="email"
                value={invite.email}
                onChange={(event) => setInvite((i) => ({ ...i, email: event.target.value }))}
                required
                autoComplete="off"
                placeholder="name@example.com"
                className={inputClass}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Role</span>
              <select
                value={invite.role}
                onChange={(event) => setInvite((i) => ({ ...i, role: event.target.value as "EDITOR" | "VIEWER" }))}
                className={`${inputClass} w-auto`}
              >
                <option value="EDITOR">Editor: can add and edit members</option>
                <option value="VIEWER">Viewer: can only look</option>
              </select>
            </label>
          </fieldset>
          <ErrorLine error={sendInvite.error ?? advance.error} />
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={sendInvite.isPending || advance.isPending} className={primaryButton}>
              {(sendInvite.isPending || advance.isPending) && <Spinner />}
              Send invite and finish
            </button>
            <button
              type="button"
              disabled={advance.isPending}
              onClick={() => void finish(treeId)}
              className="text-sm font-medium text-emerald-800 underline hover:no-underline dark:text-emerald-300"
            >
              Skip for now
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
