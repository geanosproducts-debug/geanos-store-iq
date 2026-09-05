import { randomUUID } from "node:crypto";

import { removeVideoText } from "./video-processor.server";

const videoJobs =
  globalThis.__geanosVideoJobs ||
  new Map();

globalThis.__geanosVideoJobs = videoJobs;

export function startVideoJob({
  videoFile,
  removalAreas,
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
        await removeVideoText({
          videoFile,
          removalAreas,
        });

      videoJobs.set(jobId, {
        status: "completed",
        completedVideoUrl:
          `data:${completedVideo.mimeType};base64,` +
          completedVideo.videoBase64,
        removalAreaCount:
          completedVideo.removalAreaCount,
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
        error instanceof Error
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