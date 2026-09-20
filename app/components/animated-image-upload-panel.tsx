"use client";

import { Label } from "@/app/components/ui/label";

import Image from "next/image";
import { useEffect, useId, useState } from "react";

type SelectedAnimatedImage = {
  file: File;
  previewUrl: string;
};

const ACCEPTED_FILE_EXTENSIONS = new Set([
  ".gif",
  ".webp",
  ".apng",
  ".png",
  ".avif",
]);

const ACCEPTED_FILE_TYPES = new Set([
  "image/gif",
  "image/webp",
  "image/apng",
  "image/png",
  "image/avif",
]);

const FILE_INPUT_ACCEPT =
  ".gif,.webp,.apng,.png,.avif,image/gif,image/webp,image/apng,image/png,image/avif";

function getFileExtension(filename: string) {
  const lastDotIndex = filename.lastIndexOf(".");
  if (lastDotIndex === -1) {
    return "";
  }

  return filename.slice(lastDotIndex).toLowerCase();
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAcceptedAnimatedImage(file: File) {
  const normalizedType = file.type.toLowerCase();
  const normalizedExtension = getFileExtension(file.name);

  return (
    ACCEPTED_FILE_TYPES.has(normalizedType) ||
    ACCEPTED_FILE_EXTENSIONS.has(normalizedExtension)
  );
}

export function AnimatedImageUploadPanel() {
  const inputId = useId();
  const [selectedImage, setSelectedImage] =
    useState<SelectedAnimatedImage | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (selectedImage) {
        URL.revokeObjectURL(selectedImage.previewUrl);
      }
    };
  }, [selectedImage]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;

    if (!nextFile) {
      if (selectedImage) {
        URL.revokeObjectURL(selectedImage.previewUrl);
      }
      setSelectedImage(null);
      setErrorMessage(null);
      return;
    }

    if (!isAcceptedAnimatedImage(nextFile)) {
      event.target.value = "";
      setErrorMessage(
        "Choose a GIF, animated WebP, APNG, PNG/APNG, or AVIF file.",
      );
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(nextFile);

    if (selectedImage) {
      URL.revokeObjectURL(selectedImage.previewUrl);
    }

    setSelectedImage({
      file: nextFile,
      previewUrl: nextPreviewUrl,
    });
    setErrorMessage(null);
  }

  return (
    <section className="w-full rounded-lg border border-border bg-card p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-normal text-primary">
            Animated Upload
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-foreground">
            Upload an animated image from your computer
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The old location-style prompt is replaced with a local file picker.
            This accepts GIF, WebP, APNG/PNG, and AVIF files so you can choose an
            animated image directly from disk.
          </p>
        </div>

        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4">
          <Label
            htmlFor={inputId}
            className="flex cursor-pointer flex-col gap-3 rounded-lg border border-dashed border-border bg-accent p-4 text-sm text-foreground transition hover:border-primary/40 hover:bg-accent dark:bg-card dark:hover:border-border"
          >
            <span className="font-medium text-foreground">
              Choose animated image
            </span>
            <span>
              Accepted: <code>.gif</code>, <code>.webp</code>, <code>.apng</code>,{" "}
              <code>.png</code>, <code>.avif</code>
            </span>
            <input
              id={inputId}
              type="file"
              accept={FILE_INPUT_ACCEPT}
              onChange={handleFileChange}
              className="sr-only"
            />
          </Label>

          {errorMessage ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
              {errorMessage}
            </p>
          ) : null}

          {selectedImage ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-border bg-accent p-3 text-sm text-foreground dark:border-primary/40">
                <p className="font-medium text-foreground">
                  {selectedImage.file.name}
                </p>
                <p className="mt-1">
                  {selectedImage.file.type || "Unknown type"} •{" "}
                  {formatFileSize(selectedImage.file.size)}
                </p>
              </div>

              <div className="overflow-hidden rounded-lg border border-border bg-slate-950/95">
                <Image
                  src={selectedImage.previewUrl}
                  alt={`Preview of ${selectedImage.file.name}`}
                  width={640}
                  height={320}
                  unoptimized
                  className="h-64 w-full object-contain"
                />
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              No file selected yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
