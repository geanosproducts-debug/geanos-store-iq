import { randomUUID } from "node:crypto";

import {
  NoTranslatableVideoTextError,
  translateVideo,
} from "./video-processor.server";

const videoJobs =
  globalThis.__geanosVideoJobs ||
  new Map();

globalThis.__geanosVideoJobs = videoJobs;

export function startVideoJob({
  videoFile,
  sourceLanguage,
  translationMode,
}) {
  const jobId = randomUUID();

  videoJobs.set(jobId, {
    status: "queued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  void Promise.resolve().then(async () => {
    videoJobs.set(jobId, {
      ...videoJobs.get(jobId),
      status: "processing",
      updatedAt: Date.now(),
    });

    try {
      const completedVideo =
        await translateVideo({
          videoFile,
          sourceLanguage,
          translationMode,
        });

      videoJobs.set(jobId, {
        status: "completed",
        completedVideoUrl:
          `data:${completedVideo.mimeType};base64,` +
          completedVideo.videoBase64,
        subtitleCount:
          completedVideo.subtitleCount,
        createdAt:
          videoJobs.get(jobId)?.createdAt ||
          Date.now(),
        updatedAt: Date.now(),
      });
    } catch (error) {
      console.error(
        "Background video processing failed:",
        error,
      );

      const errorMessage =
        error instanceof
        NoTranslatableVideoTextError
          ? error.message
          : "The video could not be processed. Please try again.";

      videoJobs.set(jobId, {
        status: "failed",
        error: errorMessage,
        createdAt:
          videoJobs.get(jobId)?.createdAt ||
          Date.now(),
        updatedAt: Date.now(),
      });
    }
  });

  return jobId;
}

export function getVideoJob(jobId) {
  return videoJobs.get(jobId) || null;
}