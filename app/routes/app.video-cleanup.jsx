import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getVideoJob,
  startVideoJob,
} from "../services/video-job-manager.server";
import styles from "../styles/media-tools.module.css";

const MAX_VIDEO_SIZE = 200 * 1024 * 1024;

const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

export async function action({ request }) {
  await authenticate.admin(request);

  try {
    const formData = await request.formData();
    const intent =
      formData.get("intent") || "start";

    if (intent === "status") {
      const jobId = formData.get("jobId");

      if (!jobId) {
        return {
          error:
            "The video processing job could not be identified.",
        };
      }

      const job = getVideoJob(jobId);

      if (!job) {
        return {
          error:
            "The video processing job is no longer available.",
        };
      }

      return {
        jobId,
        status: job.status,
        completedVideoUrl:
          job.completedVideoUrl,
        subtitleCount:
          job.subtitleCount,
        error: job.error,
      };
    }

    const videoFile = formData.get("video");
    const sourceLanguage =
      formData.get("sourceLanguage") ||
      "auto";
    const processingChoice =
      formData.get("processingChoice") ||
      "translate";
    const translationMode =
      formData.get("translationMode") ||
      "replace";

    if (
      !videoFile ||
      typeof videoFile.arrayBuffer !==
        "function"
    ) {
      return {
        error:
          "Please select a video before processing.",
      };
    }

    if (
      !ACCEPTED_VIDEO_TYPES.includes(
        videoFile.type,
      )
    ) {
      return {
        error:
          "Please upload an MP4, WEBM or MOV video file.",
      };
    }

    if (videoFile.size > MAX_VIDEO_SIZE) {
      return {
        error:
          "The selected video is larger than the 200 MB limit.",
      };
    }

    if (processingChoice !== "translate") {
      return {
        error:
          "This processing option will be connected in the next video build.",
      };
    }

    const jobId = startVideoJob({
      videoFile,
      sourceLanguage,
      translationMode,
    });

    return {
      jobId,
      status: "queued",
    };
  } catch (error) {
    console.error(
      "Video job could not be started:",
      error,
    );

    return {
      error:
        "The video could not be submitted for processing. Please try again.",
    };
  }
}

export default function VideoCleanup() {
  const fetcher = useFetcher();
  const statusFetcher = useFetcher();

  const [selectedFile, setSelectedFile] =
    useState(null);
  const [previewUrl, setPreviewUrl] =
    useState("");
  const [rightsConfirmed, setRightsConfirmed] =
    useState(false);
  const [
    processingChoice,
    setProcessingChoice,
  ] = useState("translate");
  const [sourceLanguage, setSourceLanguage] =
    useState("auto");
  const [translationMode, setTranslationMode] =
    useState("replace");
  const [error, setError] = useState("");
  const [analysisStarted, setAnalysisStarted] =
    useState(false);
  const [inputKey, setInputKey] = useState(0);

  const jobId = fetcher.data?.jobId;

  const statusData =
    statusFetcher.data?.jobId === jobId
      ? statusFetcher.data
      : fetcher.data;

  const jobStatus = statusData?.status;

  const isProcessing =
    fetcher.state !== "idle" ||
    Boolean(
      jobId &&
        jobStatus !== "completed" &&
        jobStatus !== "failed",
    );

  const processingError = statusData?.error;
  const completedVideoUrl =
    statusData?.completedVideoUrl;
  const subtitleCount =
    statusData?.subtitleCount;

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return undefined;
    }

    const videoUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(videoUrl);

    return () => {
      URL.revokeObjectURL(videoUrl);
    };
  }, [selectedFile]);

    useEffect(() => {
    if (
      !jobId ||
      jobStatus === "completed" ||
      jobStatus === "failed"
    ) {
      return undefined;
    }

    function checkJobStatus() {
      const statusFormData =
        new FormData();

      statusFormData.append(
        "intent",
        "status",
      );

      statusFormData.append(
        "jobId",
        jobId,
      );

      statusFetcher.submit(
        statusFormData,
        {
          method: "post",
        },
      );
    }

    checkJobStatus();

    const intervalId = window.setInterval(
      checkJobStatus,
      3000,
    );

    return () => {
      window.clearInterval(intervalId);
    };
  }, [jobId, jobStatus]);

  function handleFileChange(event) {
    const file = event.target.files?.[0];

    setError("");
    setAnalysisStarted(false);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
      setSelectedFile(null);
      setError(
        "Please select an MP4, WEBM or MOV video file.",
      );
      return;
    }

    if (file.size > MAX_VIDEO_SIZE) {
      setSelectedFile(null);
      setError(
        "The selected video is larger than the 200 MB limit.",
      );
      return;
    }

    setSelectedFile(file);
  }

  function clearVideo() {
    setSelectedFile(null);
    setRightsConfirmed(false);
    setProcessingChoice("translate");
    setSourceLanguage("auto");
    setTranslationMode("replace");
    setError("");
    setAnalysisStarted(false);
    setInputKey((currentKey) => currentKey + 1);
  }
    function startVideoProcessing() {
    if (!selectedFile || !rightsConfirmed) {
      return;
    }

    const formData = new FormData();

    formData.append("video", selectedFile);
    formData.append("rightsConfirmed", "true");
    formData.append(
      "processingChoice",
      processingChoice,
    );
    formData.append("sourceLanguage", sourceLanguage);
    formData.append("translationMode", translationMode);

    fetcher.submit(formData, {
      method: "post",
      encType: "multipart/form-data",
    });
  }

  return (
    <s-page heading="Video Translator & Cleanup">
      <section className={styles.mediaCard}>
        <s-button href="/app/media-tools" variant="primary">
          ← Back to Media Tools
        </s-button>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Upload Video</s-heading>

        <s-paragraph>
          Upload a product video to translate visible text, add English
          subtitles, remove authorised overlays or prepare the video
          for GEANOS branding.
        </s-paragraph>

        <input
          key={inputKey}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={handleFileChange}
        />

        <s-paragraph>
          Accepted formats: MP4, WEBM and MOV. Maximum file size:
          200 MB.
        </s-paragraph>

        {error && <s-banner tone="critical">{error}</s-banner>}
      </section>

      {selectedFile && (
        <section className={styles.mediaCard}>
          <s-heading>Original Video</s-heading>

          <s-paragraph>
            File: {selectedFile.name}
          </s-paragraph>

          <s-paragraph>
            File size:{" "}
            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
          </s-paragraph>

          <video
            src={previewUrl}
            controls
            style={{
              display: "block",
              width: "100%",
              maxHeight: "600px",
              borderRadius: "8px",
              backgroundColor: "#000000",
            }}
          >
            Your browser does not support video playback.
          </video>

          <s-button onClick={clearVideo}>
            Remove Video
          </s-button>
        </section>
      )}

      <section className={styles.mediaCard}>
        <s-heading>Content Rights</s-heading>

        <label>
          <input
            type="checkbox"
            checked={rightsConfirmed}
            onChange={(event) =>
              setRightsConfirmed(event.target.checked)
            }
          />{" "}
          I confirm that I own this media or have permission to
          translate, modify and remove its watermarks or overlays for
          promotional purposes in my store or stores only.
        </label>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Video Processing Options</s-heading>

        <s-unordered-list>
          <s-list-item>
            Detect visible foreign text across video frames
          </s-list-item>
          <s-list-item>
            Translate detected text into English
          </s-list-item>
          <s-list-item>
            Add English subtitles when required
          </s-list-item>
          <s-list-item>
            Remove authorised watermarks or overlays
          </s-list-item>
          <s-list-item>
            Prepare a completed video for preview and download
          </s-list-item>
        </s-unordered-list>

        <s-button
          variant="primary"
          disabled={!selectedFile || !rightsConfirmed}
          onClick={() => setAnalysisStarted(true)}
        >
          Analyse Video
        </s-button>
      </section>

      {analysisStarted && selectedFile && (
        <section className={styles.mediaCard}>
          <s-heading>Video Analysis Setup</s-heading>

          <s-banner tone="success">
            Video accepted. Choose the work required before processing
            begins.
          </s-banner>

          <s-banner tone="warning">
            Video processing can take several minutes. Please keep this
            page open and start processing only once.
          </s-banner>

          <s-paragraph>
            Selected video: {selectedFile.name}
          </s-paragraph>

          <label>
            Original language
            <br />

            <select
              value={sourceLanguage}
              onChange={(event) =>
                setSourceLanguage(event.target.value)
              }
            >
              <option value="auto">Detect automatically</option>
              <option value="chinese">Chinese</option>
              <option value="japanese">Japanese</option>
              <option value="korean">Korean</option>
              <option value="other">Other language</option>
            </select>
          </label>

          <fieldset>
            <legend>Choose the required processing</legend>

            <label>
              <input
                type="radio"
                name="videoProcessingChoice"
                value="translate"
                checked={processingChoice === "translate"}
                onChange={(event) =>
                  setProcessingChoice(event.target.value)
                }
              />{" "}
              Translate visible text and add English subtitles
            </label>

            <br />

            <label>
              <input
                type="radio"
                name="videoProcessingChoice"
                value="cleanup"
                checked={processingChoice === "cleanup"}
                onChange={(event) =>
                  setProcessingChoice(event.target.value)
                }
              />{" "}
              Remove authorised watermarks or overlays
            </label>

            <br />

            <label>
              <input
                type="radio"
                name="videoProcessingChoice"
                value="branding"
                checked={processingChoice === "branding"}
                onChange={(event) =>
                  setProcessingChoice(event.target.value)
                }
              />{" "}
              Add the GEANOS branded ending
            </label>
          </fieldset>
                       {processingChoice === "translate" && (
            <fieldset>
              <legend>
                Choose how the English translation should appear
              </legend>

              <label>
                <input
                  type="radio"
                  name="translationMode"
                  value="replace"
                  checked={translationMode === "replace"}
                  onChange={(event) =>
                    setTranslationMode(event.target.value)
                  }
                />{" "}
                Replace visible foreign text with English
              </label>

              <br />

              <label>
                <input
                  type="radio"
                  name="translationMode"
                  value="subtitles"
                  checked={translationMode === "subtitles"}
                  onChange={(event) =>
                    setTranslationMode(event.target.value)
                  }
                />{" "}
                Keep the original text and add English subtitles
              </label>
            </fieldset>
          )}

            {processingChoice !== "translate" && (
            <s-banner tone="warning">
              Watermark removal and GEANOS branding will be connected
              after the translation workflow has been tested.
            </s-banner>
          )}

          {processingError && (
            <s-banner tone="critical">
              {processingError}
            </s-banner>
          )}

          <s-button
            variant="primary"
            disabled={
              isProcessing ||
              processingChoice !== "translate"
            }
            onClick={startVideoProcessing}
          >
            {isProcessing
              ? "Processing Video..."
              : "Start Video Translation"}
          </s-button>
        </section>
      )}

      {completedVideoUrl && (
        <section className={styles.mediaCard}>
          <s-heading>Completed Video</s-heading>

          <s-banner tone="success">
            Video translation completed successfully. Review the
            English subtitles before downloading the video.
          </s-banner>

          <s-paragraph>
            English subtitle sections added: {subtitleCount}
          </s-paragraph>

          <video
            src={completedVideoUrl}
            controls
            style={{
              display: "block",
              width: "100%",
              maxHeight: "600px",
              borderRadius: "8px",
              backgroundColor: "#000000",
            }}
          >
            Your browser does not support video playback.
          </video>

          <p>
            <a
              href={completedVideoUrl}
              download="GEANOS-translated-video.mp4"
            >
              Download Completed Video
            </a>
          </p>

          <s-button onClick={clearVideo}>
            Process Another Video
          </s-button>
        </section>
      )}
    </s-page>
  );
}