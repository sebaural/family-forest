"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import {
  dangerButton,
  errorText,
  inputClass,
  primaryButton,
  secondaryButton,
} from "@/components/ui/styles";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";

const treeNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Tree name is required")
    .max(100, "Tree name must be 100 characters or fewer"),
});
type TreeNameValues = z.infer<typeof treeNameSchema>;

interface TreeNameFormProps {
  defaultName: string;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

function TreeNameForm({
  defaultName,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: TreeNameFormProps) {
  const form = useForm<TreeNameValues>({
    resolver: zodResolver(treeNameSchema),
    defaultValues: { name: defaultName },
  });
  const fieldError = form.formState.errors.name?.message;

  return (
    <form onSubmit={form.handleSubmit(({ name }) => onSubmit(name))} className="space-y-4" noValidate>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Tree name</span>
        <input
          {...form.register("name")}
          aria-invalid={!!fieldError}
          placeholder="Smith Family"
          className={inputClass}
        />
      </label>
      {fieldError && (
        <p role="alert" className={errorText}>
          {fieldError}
        </p>
      )}
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={secondaryButton}>
          Cancel
        </button>
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending && <Spinner />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

interface DialogControlProps {
  open: boolean;
  onClose: () => void;
}

function CreateTreeForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const createTree = trpc.trees.create.useMutation({
    onSuccess: (tree) => {
      void utils.trees.list.invalidate();
      router.push(`/tree/${tree.id}`);
    },
  });

  return (
    <TreeNameForm
      defaultName=""
      submitLabel="Create tree"
      // Stays pending through navigation so the tree can't be created twice.
      pending={createTree.isPending || createTree.isSuccess}
      error={createTree.error && getErrorMessage(createTree.error)}
      onSubmit={(name) => createTree.mutate({ name })}
      onCancel={onClose}
    />
  );
}

export function CreateTreeModal({ open, onClose }: DialogControlProps) {
  return (
    <Dialog open={open} onClose={onClose} title="New tree">
      <CreateTreeForm onClose={onClose} />
    </Dialog>
  );
}

interface TreeSummary {
  id: string;
  name: string;
  memberCount: number;
}

function RenameTreeForm({ tree, onClose }: { tree: TreeSummary; onClose: () => void }) {
  const utils = trpc.useUtils();
  const renameTree = trpc.trees.update.useMutation({
    onSuccess: () => {
      void utils.trees.list.invalidate();
      void utils.trees.get.invalidate({ treeId: tree.id });
      onClose();
    },
  });

  return (
    <TreeNameForm
      defaultName={tree.name}
      submitLabel="Rename"
      pending={renameTree.isPending}
      error={renameTree.error && getErrorMessage(renameTree.error)}
      onSubmit={(name) => renameTree.mutate({ treeId: tree.id, name })}
      onCancel={onClose}
    />
  );
}

export function RenameTreeDialog({
  tree,
  open,
  onClose,
}: DialogControlProps & { tree: TreeSummary }) {
  return (
    <Dialog open={open} onClose={onClose} title="Rename tree">
      <RenameTreeForm tree={tree} onClose={onClose} />
    </Dialog>
  );
}

function deleteConsequence(memberCount: number): string {
  if (memberCount === 0) return "This will permanently delete the tree.";
  if (memberCount === 1) return "This will permanently delete its 1 member.";
  return `This will permanently delete all ${memberCount} members and relationships.`;
}

function DeleteTreeBody({
  tree,
  onClose,
  onDeleted,
}: {
  tree: TreeSummary;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const utils = trpc.useUtils();
  const deleteTree = trpc.trees.delete.useMutation({
    onSuccess: () => {
      void utils.trees.list.invalidate();
      onDeleted();
    },
  });

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Delete <strong>{tree.name}</strong>? {deleteConsequence(tree.memberCount)}
      </p>
      {deleteTree.error && (
        <p role="alert" className={errorText}>
          {getErrorMessage(deleteTree.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={secondaryButton}>
          Cancel
        </button>
        <button
          type="button"
          disabled={deleteTree.isPending || deleteTree.isSuccess}
          onClick={() => deleteTree.mutate({ treeId: tree.id })}
          className={dangerButton}
        >
          {deleteTree.isPending && <Spinner />}
          Delete tree
        </button>
      </div>
    </div>
  );
}

export function DeleteTreeDialog({
  tree,
  open,
  onClose,
  onDeleted,
}: DialogControlProps & { tree: TreeSummary; onDeleted: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Delete tree">
      <DeleteTreeBody tree={tree} onClose={onClose} onDeleted={onDeleted} />
    </Dialog>
  );
}
