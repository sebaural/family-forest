"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, type FieldError } from "react-hook-form";
import { z } from "zod";
import { MemberRelationships } from "@/components/relationships/MemberRelationships";
import { Spinner } from "@/components/ui/Spinner";
import {
  dangerButton,
  errorText,
  inputClass,
  mutedText,
  primaryButton,
  secondaryButton,
} from "@/components/ui/styles";
import {
  fromDateInputValue,
  memberFullName,
  toDateInputValue,
} from "@/lib/member-format";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";
import type { Member } from "@/trpc/types";

const tooLong = (max: number) => `Must be ${max} characters or fewer`;

const memberFormSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100, tooLong(100)),
  lastName: z.string().trim().min(1, "Last name is required").max(100, tooLong(100)),
  birthDate: z.string().optional(), // "YYYY-MM-DD"
  deathDate: z.string().optional(),
  living: z.boolean(),
  birthPlace: z.string().trim().max(200, tooLong(200)),
  occupation: z.string().trim().max(200, tooLong(200)),
  bio: z.string().trim().max(2000, tooLong(2000)),
});
type MemberFormValues = z.infer<typeof memberFormSchema>;

function toFormValues(member?: Member): MemberFormValues {
  return {
    firstName: member?.firstName ?? "",
    lastName: member?.lastName ?? "",
    birthDate: toDateInputValue(member?.birthDate ?? null),
    deathDate: toDateInputValue(member?.deathDate ?? null),
    living: !member?.deathDate,
    birthPlace: member?.birthPlace ?? "",
    occupation: member?.occupation ?? "",
    bio: member?.bio ?? "",
  };
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: FieldError;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error?.message && <span className={`block ${errorText}`}>{error.message}</span>}
    </label>
  );
}

interface MemberPanelProps {
  treeId: string;
  /** The member to edit; omit to add a new one. */
  member?: Member;
  members: Member[];
  canEdit: boolean;
  onClose: () => void;
  onAdded?: (memberId: string) => void;
}

export function MemberPanel({
  treeId,
  member,
  members,
  canEdit,
  onClose,
  onAdded,
}: MemberPanelProps) {
  const utils = trpc.useUtils();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const form = useForm<MemberFormValues>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: toFormValues(member),
    // Picks up saved or refetched values without discarding unsaved edits.
    values: member ? toFormValues(member) : undefined,
    resetOptions: { keepDirtyValues: true },
  });
  const { errors } = form.formState;
  const living = form.watch("living");

  const invalidate = () => {
    void utils.members.list.invalidate({ treeId });
    void utils.trees.get.invalidate({ treeId });
    void utils.trees.list.invalidate();
  };

  const addMember = trpc.members.add.useMutation({
    onSuccess: (created) => {
      invalidate();
      onAdded?.(created.id);
    },
  });
  const updateMember = trpc.members.update.useMutation({ onSuccess: invalidate });
  const removeMember = trpc.members.remove.useMutation({
    onSuccess: () => {
      invalidate();
      void utils.relationships.list.invalidate({ treeId });
      onClose();
    },
  });

  const onSubmit = (values: MemberFormValues) => {
    const { firstName, lastName, birthDate, deathDate, living: isLiving } = values;
    const death = isLiving ? "" : deathDate;

    if (member) {
      // On update, null clears a field the user emptied.
      updateMember.mutate({
        memberId: member.id,
        firstName,
        lastName,
        birthDate: birthDate ? fromDateInputValue(birthDate) : null,
        deathDate: death ? fromDateInputValue(death) : null,
        birthPlace: values.birthPlace || null,
        occupation: values.occupation || null,
        bio: values.bio || null,
      });
    } else {
      addMember.mutate({
        treeId,
        firstName,
        lastName,
        birthDate: birthDate ? fromDateInputValue(birthDate) : undefined,
        deathDate: death ? fromDateInputValue(death) : undefined,
        birthPlace: values.birthPlace || undefined,
        occupation: values.occupation || undefined,
        bio: values.bio || undefined,
      });
    }
  };

  const saving = addMember.isPending || updateMember.isPending;
  const saveError = addMember.error ?? updateMember.error;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      {member && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-xl font-semibold">{memberFullName(member)}</h2>
          <button type="button" onClick={onClose} className={`${secondaryButton} md:hidden`}>
            Back to list
          </button>
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <fieldset disabled={!canEdit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" error={errors.firstName}>
              <input {...form.register("firstName")} className={inputClass} />
            </Field>
            <Field label="Last name" error={errors.lastName}>
              <input {...form.register("lastName")} className={inputClass} />
            </Field>
            <Field label="Birth date" error={errors.birthDate}>
              <input type="date" {...form.register("birthDate")} className={inputClass} />
            </Field>
            <Field label="Death date" error={errors.deathDate}>
              <input
                type="date"
                {...form.register("deathDate")}
                disabled={living}
                className={inputClass}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...form.register("living", {
                onChange: (event) => {
                  if (event.target.checked) form.setValue("deathDate", "");
                },
              })}
            />
            Living
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Birth place" error={errors.birthPlace}>
              <input {...form.register("birthPlace")} className={inputClass} />
            </Field>
            <Field label="Occupation" error={errors.occupation}>
              <input {...form.register("occupation")} className={inputClass} />
            </Field>
          </div>
          <Field label="Bio" error={errors.bio}>
            <textarea {...form.register("bio")} rows={4} className={inputClass} />
          </Field>
        </fieldset>

        {saveError && (
          <p role="alert" className={errorText}>
            {getErrorMessage(saveError)}
          </p>
        )}

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={saving} className={primaryButton}>
              {saving && <Spinner />}
              {member ? "Save changes" : "Add member"}
            </button>
            {!member && (
              <button type="button" onClick={onClose} className={secondaryButton}>
                Cancel
              </button>
            )}
            {member && updateMember.isSuccess && (
              <span role="status" className={mutedText}>
                Saved
              </span>
            )}
          </div>
        )}
      </form>

      {member && (
        <MemberRelationships treeId={treeId} member={member} members={members} canEdit={canEdit} />
      )}

      {member && canEdit && (
        <section className="space-y-3 border-t border-gray-200 pt-6 dark:border-gray-800">
          {confirmingDelete ? (
            <>
              <p className="text-sm">
                Remove <strong>{memberFullName(member)}</strong> from this tree?
              </p>
              {removeMember.error && (
                <p role="alert" className={errorText}>
                  {getErrorMessage(removeMember.error)}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={removeMember.isPending}
                  onClick={() => removeMember.mutate({ memberId: member.id })}
                  className={dangerButton}
                >
                  {removeMember.isPending && <Spinner />}
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className={secondaryButton}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="text-sm text-red-600 hover:underline dark:text-red-400"
            >
              Remove from tree
            </button>
          )}
        </section>
      )}
    </div>
  );
}
