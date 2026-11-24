"use client";

import { TRPCClientError } from "@trpc/client";
import { useEffect, useRef, useState } from "react";
import { SettingsLoading, SettingsSection } from "@/components/settings/shared";
import { Spinner } from "@/components/ui/Spinner";
import { errorText, inputClass, mutedText, primaryButton, secondaryButton } from "@/components/ui/styles";
import { UserAvatar } from "@/components/user/UserAvatar";
import { isPhotoContentType, PHOTO_MAX_BYTES } from "@/lib/photo";
import { getErrorMessage } from "@/lib/trpc-error";
import { uploadFile } from "@/lib/upload";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/types";

type Me = RouterOutputs["users"]["me"];

function useProfileRefresh() {
  const utils = trpc.useUtils();
  // The nav and activity entries read these, so they update without a reload.
  return () => Promise.all([utils.users.me.invalidate(), utils.activity.list.invalidate()]);
}

function AvatarField({ me }: { me: Me }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const refresh = useProfileRefresh();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const signUpload = trpc.users.avatarUploadUrl.useMutation();
  const update = trpc.users.updateProfile.useMutation({ onSuccess: refresh });

  const busy = progress !== null || update.isPending;

  const handleFile = async (file: File) => {
    setError(null);
    if (!isPhotoContentType(file.type)) return setError("Choose a JPEG, PNG or WebP image.");
    if (file.size > PHOTO_MAX_BYTES) return setError("Pictures must be 5 MB or smaller.");

    setProgress(0);
    try {
      const { uploadUrl, publicUrl } = await signUpload.mutateAsync({
        contentType: file.type,
        size: file.size,
      });
      await uploadFile(uploadUrl, file, setProgress);
      setProgress(null);
      await update.mutateAsync({ avatarUrl: publicUrl });
    } catch (err) {
      setError(
        err instanceof TRPCClientError
          ? getErrorMessage(err)
          : err instanceof Error
            ? err.message
            : "Upload failed. Please try again.",
      );
    } finally {
      setProgress(null);
    }
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file && !busy) void handleFile(file);
      }}
      className={`-m-2 flex items-center gap-4 rounded-lg p-2 ${
        dragging ? "bg-emerald-50 ring-2 ring-emerald-500 dark:bg-emerald-950" : ""
      }`}
    >
      <UserAvatar name={me.name} email={me.email} src={me.avatar} size="lg" />
      <div className="min-w-0 space-y-2">
        <span className="block text-sm font-medium">Profile photo</span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleFile(file);
            }}
          />
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={secondaryButton}>
            {busy && <Spinner />}
            {update.isPending && progress === null ? "Saving…" : "Upload photo"}
          </button>
          {me.hasUploadedAvatar && !busy && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                update.mutate({ avatarUrl: null }, { onError: (err) => setError(getErrorMessage(err)) });
              }}
              className="text-sm text-red-700 hover:underline dark:text-red-400"
            >
              Remove
            </button>
          )}
        </div>
        {progress !== null ? (
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="h-1.5 w-48 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
          >
            <div className="h-full bg-emerald-600 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        ) : (
          <p className={`text-xs ${mutedText}`}>
            JPEG, PNG or WebP, up to 5 MB. You can also drop a file here. It&apos;s cropped to a square.
          </p>
        )}
        {error && (
          <p role="alert" className={errorText}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function NameForm({ me }: { me: Me }) {
  const refresh = useProfileRefresh();
  const [name, setName] = useState(me.name ?? "");
  const [saved, setSaved] = useState(false);
  const update = trpc.users.updateProfile.useMutation({
    onSuccess: async () => {
      await refresh();
      setSaved(true);
    },
  });
  useEffect(() => setSaved(false), [name]);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate({ name });
      }}
    >
      <label className="block space-y-1">
        <span className="text-sm font-medium">Display name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={100}
          autoComplete="name"
          className={inputClass}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Email</span>
        <input value={me.email} readOnly aria-describedby="email-note" className={`${inputClass} bg-gray-50 dark:bg-gray-950`} />
        <span id="email-note" className={`block text-xs ${mutedText}`}>
          Your email is tied to how you sign in and can&apos;t be changed here.
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={update.isPending || name.trim() === (me.name ?? "")} className={primaryButton}>
          {update.isPending && <Spinner />}
          Save
        </button>
        <span role="status" className={mutedText}>
          {saved ? "Saved." : ""}
        </span>
      </div>
      {update.error && (
        <p role="alert" className={errorText}>
          {getErrorMessage(update.error)}
        </p>
      )}
    </form>
  );
}

export function ProfileSettings() {
  const me = trpc.users.me.useQuery();
  if (!me.data) return me.error ? <p className={errorText}>{getErrorMessage(me.error)}</p> : <SettingsLoading />;
  return (
    <div className="space-y-6">
      <SettingsSection legend="Profile photo" description="Shown in the header and next to your changes in activity.">
        <AvatarField me={me.data} />
      </SettingsSection>
      <SettingsSection legend="Profile">
        <NameForm me={me.data} />
      </SettingsSection>
    </div>
  );
}
