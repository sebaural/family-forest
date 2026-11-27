"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useMemo, useState } from "react";
import { useForm, type FieldError } from "react-hook-form";
import { z } from "zod";
import { format } from "date-fns";
import { PhotoField } from "@/components/members/PhotoField";
import { MemberRelationships } from "@/components/relationships/MemberRelationships";
import { RelationshipDialog } from "@/components/relationships/RelationshipDialog";
import { MemberAvatar } from "@/components/tree/MemberList";
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
import {
  inverseKind,
  RELATIVE_LABEL,
  relativeEdge,
  type RelativeKind,
} from "@/lib/relationship-kind";
import {
  buildKinship,
  linkOptions,
  NEW_MEMBER_ID,
  subjectView,
  type Edge,
} from "@/lib/relationship-rules";
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
  bio: z.string().trim().max(2000, tooLong(2000)),
  photoUrl: z.string().nullable(),
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
    bio: member?.bio ?? "",
    photoUrl: member?.photoUrl ?? null,
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

function formatDay(date: Date | null): string | null {
  const value = toDateInputValue(date); // "YYYY-MM-DD", read in UTC
  return value ? format(new Date(`${value}T00:00:00`), "MMM d, yyyy") : null;
}

/** Read-only view for VIEWERs: no inputs at all, not even disabled ones. */
function MemberDetails({ member }: { member: Member }) {
  const rows = [
    ["Born", [formatDay(member.birthDate), member.birthPlace].filter(Boolean).join(" · ")],
    ["Died", formatDay(member.deathDate)],
  ] as const;
  return (
    <div className="space-y-4">
      {member.photoUrl && <MemberAvatar member={member} size="lg" />}
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {rows.map(([label, value]) =>
          value ? (
            <div key={label} className="contents">
              <dt className="font-medium">{label}</dt>
              <dd className={mutedText}>{value}</dd>
            </div>
          ) : null,
        )}
        {!member.deathDate && (
          <div className="contents">
            <dt className="font-medium">Status</dt>
            <dd className={mutedText}>Living</dd>
          </div>
        )}
      </dl>
      {member.bio && <p className="whitespace-pre-line text-sm">{member.bio}</p>}
    </div>
  );
}

/** What the new member will be to an existing one. */
export type MemberLinkKind = RelativeKind;

/** A relationship queued in the Add member form: `member` is the new member's `kind`. */
interface PendingLink {
  kind: RelativeKind;
  member: Member;
}

/** Adds the new member as a relative of an existing one (from the canvas menu). */
export interface MemberLink {
  member: Member;
  as: MemberLinkKind;
}

const LINK_TEXT: Record<MemberLinkKind, string> = {
  PARENT: "parent",
  CHILD: "child",
  SPOUSE: "spouse",
  PARTNER: "partner",
};

interface MemberPanelProps {
  treeId: string;
  /** Whether the server has picture storage configured. */
  photoUploadsEnabled: boolean;
  /** The member to edit; omit to add a new one. */
  member?: Member;
  members: Member[];
  canEdit: boolean;
  onClose: () => void;
  onAdded?: (memberId: string) => void;
  /** Only when adding: link the new member to this one. */
  link?: MemberLink;
  /** Hide the member's name heading when the surrounding drawer already shows it. */
  hideTitle?: boolean;
}

export function MemberPanel({
  treeId,
  photoUploadsEnabled,
  member,
  members,
  canEdit,
  onClose,
  onAdded,
  link,
  hideTitle = false,
}: MemberPanelProps) {
  const utils = trpc.useUtils();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // "Add spouse / partner" lets the user pick which of the two.
  const [linkAs, setLinkAs] = useState<MemberLinkKind | undefined>(link?.as);
  const couple = linkAs === "SPOUSE" || linkAs === "PARTNER";
  const [pending, setPending] = useState<PendingLink[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const formId = useId();

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
    void utils.activity.list.invalidate({ treeId });
  };

  const addMember = trpc.members.add.useMutation({
    onSuccess: (created) => {
      invalidate();
      if (link || pending.length) void utils.relationships.list.invalidate({ treeId });
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
        bio: values.bio || null,
        photoUrl: values.photoUrl,
      });
    } else {
      addMember.mutate({
        treeId,
        firstName,
        lastName,
        birthDate: birthDate ? fromDateInputValue(birthDate) : undefined,
        deathDate: death ? fromDateInputValue(death) : undefined,
        birthPlace: values.birthPlace || undefined,
        bio: values.bio || undefined,
        photoUrl: values.photoUrl ?? undefined,
        links: [
          ...(link && linkAs ? [{ memberId: link.member.id, as: linkAs }] : []),
          // A queued "P is the new member's parent" means the new member is P's child.
          ...pending.map((entry) => ({ memberId: entry.member.id, as: inverseKind(entry.kind) })),
        ],
      });
    }
  };

  const saving = addMember.isPending || updateMember.isPending;
  const photoUrl = form.watch("photoUrl");
  const [firstName, lastName] = form.watch(["firstName", "lastName"]);
  const saveError = addMember.error ?? updateMember.error;
  const newName = memberFullName({ firstName, lastName }).trim() || "this member";
  // Each existing member can be linked once; the canvas link already uses one.
  const candidates = useMemo(() => {
    const linkedIds = new Set([link?.member.id, ...pending.map((entry) => entry.member.id)]);
    return members.filter((other) => !linkedIds.has(other.id));
  }, [members, link, pending]);
  // The new member's queued links, as edges, so the dialog's rules account for them.
  const relationships = trpc.relationships.list.useQuery({ treeId }, { enabled: !member });
  const treeEdges = useMemo(() => relationships.data ?? [], [relationships.data]);
  const pendingEdges = useMemo<Edge[]>(
    () => [
      // "The new member is link.member's linkAs".
      ...(link && linkAs ? [relativeEdge(linkAs, link.member.id, NEW_MEMBER_ID)] : []),
      // "entry.member is the new member's entry.kind".
      ...pending.map((entry) => relativeEdge(entry.kind, NEW_MEMBER_ID, entry.member.id)),
    ],
    [link, linkAs, pending],
  );
  const newBirthDate = form.watch("birthDate");
  const pendingBirthDate = newBirthDate ? fromDateInputValue(newBirthDate) : null;
  const linkable = useMemo(
    () =>
      linkOptions(
        subjectView(buildKinship([...treeEdges, ...pendingEdges]), {
          id: NEW_MEMBER_ID,
          birthDate: pendingBirthDate,
        }),
        candidates,
      ).size > 0,
    [treeEdges, pendingEdges, pendingBirthDate, candidates],
  );

  const actions = canEdit && (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="submit"
        form={formId}
        disabled={saving || uploadingPhoto}
        className={primaryButton}
      >
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
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      {member && !hideTitle && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-xl font-semibold">{memberFullName(member)}</h2>
          <button type="button" onClick={onClose} className={`${secondaryButton} md:hidden`}>
            Back to list
          </button>
        </div>
      )}

      {!canEdit && member ? (
        <MemberDetails member={member} />
      ) : (
        <form id={formId} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {!member && link && linkAs && (
            <div className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
              {couple ? (
                <label className="flex flex-wrap items-center gap-2">
                  <span>Will be added as</span>
                  <select
                    value={linkAs}
                    onChange={(event) => setLinkAs(event.target.value as MemberLinkKind)}
                    className="rounded border border-emerald-300 bg-white px-2 py-1 text-gray-900 dark:border-emerald-800 dark:bg-gray-900 dark:text-gray-100"
                  >
                    <option value="SPOUSE">spouse</option>
                    <option value="PARTNER">partner</option>
                  </select>
                  <span>of {memberFullName(link.member)}</span>
                </label>
              ) : (
                <p>
                  Will be added as {LINK_TEXT[linkAs]} of {memberFullName(link.member)}
                </p>
              )}
            </div>
          )}
          <fieldset disabled={!canEdit} className="space-y-4">
            {(photoUploadsEnabled || photoUrl) && (
              <PhotoField
                treeId={treeId}
                firstName={firstName}
                lastName={lastName}
                value={photoUrl}
                onChange={(url) => form.setValue("photoUrl", url, { shouldDirty: true })}
                onUploadingChange={setUploadingPhoto}
                canEdit={canEdit && photoUploadsEnabled}
              />
            )}
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
            <Field label="Birth place" error={errors.birthPlace}>
              <input {...form.register("birthPlace")} className={inputClass} />
            </Field>
            <Field label="Bio" error={errors.bio}>
              <textarea {...form.register("bio")} rows={4} className={inputClass} />
            </Field>
          </fieldset>

          {saveError && (
            <p role="alert" className={errorText}>
              {getErrorMessage(saveError)}
            </p>
          )}

          {member && actions}
        </form>
      )}

      {!member && canEdit && (
        <>
          <section className="space-y-3 border-t border-gray-200 pt-6 dark:border-gray-800">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Relationships</h3>
              <span title={linkable ? undefined : "No other members can be linked."}>
                <button
                  type="button"
                  disabled={!linkable || relationships.isPending}
                  onClick={() => setPickerOpen(true)}
                  className={secondaryButton}
                >
                  Add Relationship
                </button>
              </span>
            </div>
            {pending.length === 0 ? (
              <p className={mutedText}>No relationships yet.</p>
            ) : (
              <ul className="space-y-1">
                {pending.map((entry) => (
                  <li
                    key={entry.member.id}
                    className="flex items-center justify-between gap-3 rounded px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <span className="min-w-0 truncate">
                      <span className={mutedText}>{RELATIVE_LABEL[entry.kind]}:</span>{" "}
                      {memberFullName(entry.member)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove relationship with ${memberFullName(entry.member)}`}
                      onClick={() =>
                        setPending((list) => list.filter((other) => other.member.id !== entry.member.id))
                      }
                      className="px-2 text-gray-500 hover:text-red-600"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <RelationshipDialog
              treeId={treeId}
              subject={{
                kind: "pending",
                name: newName,
                birthDate: pendingBirthDate,
                links: pendingEdges,
              }}
              candidates={candidates}
              relationships={treeEdges}
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              onPick={(kind, relative) =>
                setPending((list) => [...list, { kind, member: relative }])
              }
            />
          </section>
          {actions}
        </>
      )}

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
