import { randomUUID } from "node:crypto";

import {
  completeMediaCredit,
  refundMediaCredit,
} from "./media-credits.server";
import { translateVideo } from "./video-translation-processor.server";

const translationJobs =
  globalThis.__geanosVideoTranslationJobs || new Map();

globalThis.__geanosVideoTranslationJobs = translationJobs;

export function startVideoTranslationJob({
  videoFile,
  sourceLanguage,
  startTime,
  endTime,
  removalAreas,
  previousEdits,
  passNumber,
  creditRequestId,
}) {
  const jobId = randomUUID();

  translationJobs.set(jobId, {
    status: "queued",
    passNumber,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  console.log(`[VIDEO TRANSLATION] Background job ${jobId} created.`);

  void Promise.resolve().then(async () => {
    translationJobs.set(jobId, {
      ...translationJobs.get(jobId),
      status: "processing",
      updatedAt: Date.now(),
    });

    console.log(`[VIDEO TRANSLATION] Background job ${jobId} processing started.`);

    try {
      const completedVideo = await translateVideo({
        videoFile,
        sourceLanguage,
        translationMode: "replace",
        startTime,
        endTime,
        removalAreas,
        previousEdits,
      });

      console.log(`[VIDEO TRANSLATION] Background job ${jobId} video processing completed.`);

      await completeMediaCredit(creditRequestId);

      translationJobs.set(jobId, {
        status: "completed",
        completedVideoUrl:
          `data:${completedVideo.mimeType};base64,` +
          completedVideo.videoBase64,
        subtitleCount: completedVideo.subtitleCount,
        completedEdit: completedVideo.completedEdit,
        editCount: completedVideo.editCount,
        passNumber,
        createdAt:
          translationJobs.get(jobId)?.createdAt || Date.now(),
        updatedAt: Date.now(),
      });

      console.log(`[VIDEO TRANSLATION] Background job ${jobId} ready for download.`);
    } catch (error) {
      console.error("Background video translation failed:", error);

      try {
        if (passNumber === 1) {
          await refundMediaCredit(creditRequestId);
        } else {
          await completeMediaCredit(creditRequestId);
        }
      } catch (creditError) {
        console.error(
          "Video translation credit settlement failed:",
          creditError,
        );
      }

      translationJobs.set(jobId, {
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "The video could not be translated. Please try again.",
        passNumber,
        creditRefunded: passNumber === 1,
        createdAt:
          translationJobs.get(jobId)?.createdAt || Date.now(),
        updatedAt: Date.now(),
      });
    }
  });

  return jobId;
}

export function getVideoTranslationJob(jobId) {
  return translationJobs.get(jobId) || null;
}
