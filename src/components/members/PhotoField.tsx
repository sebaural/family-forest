"use client";

import { TRPCClientError } from "@trpc/client";
import { useRef, useState } from "react";
import { MemberAvatar } from "@/components/tree/MemberList";
import { Spinner } from "@/components/ui/Spinner";
import { errorText, mutedText, secondaryButton } from "@/components/ui/styles";
import { isPhotoContentType, PHOTO_MAX_BYTES } from "@/lib/photo";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";

/** PUTs the file to the signed URL, reporting progress from 0 to 1. */
function uploadFile(url: string, file: File, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(file);
  });
}

interface PhotoFieldProps {
  treeId: string;
  firstName: string;
  lastName: string;
  value: string | null;
  onChange: (photoUrl: string | null) => void;
  onUploadingChange: (uploading: boolean) => void;
  canEdit: boolean;
}

export function PhotoField({
  treeId,
  firstName,
  lastName,
  value,
  onChange,
  onUploadingChange,
  canEdit,
}: PhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signUpload = trpc.members.photoUploadUrl.useMutation();

  const uploading = progress !== null;
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    if (!isPhotoContentType(file.type)) {
      setError("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setError("Pictures must be 5 MB or smaller.");
      return;
    }

    setProgress(0);
    onUploadingChange(true);
    try {
      const { uploadUrl, publicUrl } = await signUpload.mutateAsync({
        treeId,
        contentType: file.type,
        size: file.size,
      });
      await uploadFile(uploadUrl, file, setProgress);
      onChange(publicUrl);
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
      onUploadingChange(false);
    }
  };

  const dropHandlers = canEdit
    ? {
        onDragOver: (event: React.DragEvent) => {
          event.preventDefault();
          if (!uploading) setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (event: React.DragEvent) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file && !uploading) void handleFile(file);
        },
      }
    : {};

  return (
    <div
      {...dropHandlers}
      className={`flex items-center gap-4 rounded-lg p-2 -m-2 ${
        dragging ? "bg-emerald-50 ring-2 ring-emerald-500 dark:bg-emerald-950" : ""
      }`}
    >
      <MemberAvatar member={{ firstName: firstName || "?", lastName, photoUrl: value }} size="lg" />
      <div className="min-w-0 space-y-2">
        <span className="block text-sm font-medium">Picture</span>
        {canEdit && (
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
                event.target.value = ""; // allow picking the same file again
                if (file) void handleFile(file);
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className={secondaryButton}
            >
              {uploading && <Spinner />}
              {value ? "Change picture" : "Upload picture"}
            </button>
            {value && !uploading && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="text-sm text-red-600 hover:underline dark:text-red-400"
              >
                Remove
              </button>
            )}
          </div>
        )}
        {progress !== null ? (
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="h-1.5 w-48 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
          >
            <div
              className="h-full bg-emerald-600 transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        ) : (
          canEdit && (
            <p className={`text-xs ${mutedText}`}>
              JPEG, PNG or WebP, up to 5 MB. You can also drop a file here.
            </p>
          )
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
