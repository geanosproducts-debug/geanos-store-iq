import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getVideoJob,
  startVideoJob,
} from "../services/video-job-manager.server";
import styles from "../styles/media-tools.module.css";

const MAX_VIDEO_SIZE = 200 * 1024 * 1024;
const MAX_REMOVAL_AREAS = 20;
const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

function parseRemovalAreas(value) {
  try {
    const parsedValue = JSON.parse(value || "[]");
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue
      .map((area) => ({
        x: Number(area?.x),
        y: Number(area?.y),
        width: Number(area?.width),
        height: Number(area?.height),
        startTime: Number(area?.startTime),
        endTime: Number(area?.endTime),
      }))
      .filter(
        (area) =>
          Number.isFinite(area.x) &&
          Number.isFinite(area.y) &&
          Number.isFinite(area.width) &&
          Number.isFinite(area.height) &&
          Number.isFinite(area.startTime) &&
          Number.isFinite(area.endTime) &&
          area.x >= 0 &&
          area.y >= 0 &&
          area.width >= 0.5 &&
          area.height >= 0.5 &&
          area.startTime >= 0 &&
          area.endTime > area.startTime &&
          area.x + area.width <= 100 &&
          area.y + area.height <= 100,
      )
      .slice(0, MAX_REMOVAL_AREAS);
  } catch {
    return [];
  }
}

export async function action({ request }) {
  await authenticate.admin(request);

  try {
    const formData = await request.formData();
    const intent = formData.get("intent") || "start";

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
        completedVideoUrl: job.completedVideoUrl,
        removalAreaCount: job.removalAreaCount,
        error: job.error,
      };
    }

    const videoFile = formData.get("video");
    const rightsConfirmed =
      formData.get("rightsConfirmed") === "true";
    const removalAreas = parseRemovalAreas(
      formData.get("removalAreas"),
    );

    if (!rightsConfirmed) {
      return {
        error:
          "Confirm that you have permission to modify this video.",
      };
    }

    if (
      !videoFile ||
      typeof videoFile.arrayBuffer !== "function"
    ) {
      return {
        error:
          "Please select a video before processing.",
      };
    }

    if (
      !ACCEPTED_VIDEO_TYPES.includes(videoFile.type)
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

    if (removalAreas.length === 0) {
      return {
        error:
          "Mark at least one text area before processing.",
      };
    }

    const jobId = startVideoJob({
      videoFile,
      removalAreas,
    });

    return {
      jobId,
      status: "queued",
    };
  } catch (error) {
    console.error(
      "Video text-removal job could not be started:",
      error,
    );

    return {
      error:
        "The video could not be submitted for processing. Please try again.",
    };
  }
}

function normaliseRectangle(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);

  return {
    x,
    y,
    width: Math.max(start.x, end.x) - x,
    height: Math.max(start.y, end.y) - y,
  };
}

export default function VideoCleanup() {
  const fetcher = useFetcher();
  const statusFetcher = useFetcher();
  const previewContainerRef = useRef(null);
  const videoRef = useRef(null);

  const [selectedFile, setSelectedFile] =
    useState(null);
  const [previewUrl, setPreviewUrl] =
    useState("");
  const [rightsConfirmed, setRightsConfirmed] =
    useState(false);
  const [removalAreas, setRemovalAreas] =
    useState([]);
  const [selectionMode, setSelectionMode] =
    useState(false);
  const [dragStart, setDragStart] =
    useState(null);
  const [draftArea, setDraftArea] =
    useState(null);
  const [error, setError] = useState("");
  const [setupStarted, setSetupStarted] =
    useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [videoDuration, setVideoDuration] =
    useState(0);

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
  const removalAreaCount =
    statusData?.removalAreaCount;

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return undefined;
    }

    const videoUrl =
      URL.createObjectURL(selectedFile);

    setPreviewUrl(videoUrl);

    return () => URL.revokeObjectURL(videoUrl);
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
      const statusFormData = new FormData();

      statusFormData.append("intent", "status");
      statusFormData.append("jobId", jobId);

      statusFetcher.submit(statusFormData, {
        method: "post",
      });
    }

    checkJobStatus();

    const intervalId = window.setInterval(
      checkJobStatus,
      2000,
    );

    return () =>
      window.clearInterval(intervalId);
  }, [jobId, jobStatus]);

  function handleFileChange(event) {
    const file = event.target.files?.[0];

    setError("");
    setSetupStarted(false);
    setRemovalAreas([]);
    setSelectionMode(false);
    setVideoDuration(0);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (
      !ACCEPTED_VIDEO_TYPES.includes(file.type)
    ) {
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
    setRemovalAreas([]);
    setSelectionMode(false);
    setDraftArea(null);
    setDragStart(null);
    setError("");
    setSetupStarted(false);
    setInputKey(
      (currentKey) => currentKey + 1,
    );
    setVideoDuration(0);
  }

  function getPointerPercentage(event) {
    const video = videoRef.current;

    if (!video) return null;

    const bounds =
      video.getBoundingClientRect();

    return {
      x: Math.min(
        Math.max(
          ((event.clientX - bounds.left) /
            bounds.width) *
            100,
          0,
        ),
        100,
      ),
      y: Math.min(
        Math.max(
          ((event.clientY - bounds.top) /
            bounds.height) *
            100,
          0,
        ),
        100,
      ),
    };
  }

  function beginAreaSelection() {
    videoRef.current?.pause();
    setSelectionMode(true);
    setDraftArea(null);
    setDragStart(null);
    setError("");
  }

  function handlePointerDown(event) {
    if (!selectionMode) return;

    const point = getPointerPercentage(event);

    if (!point) return;

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );

    setDragStart(point);

    setDraftArea({
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
    });
  }

  function handlePointerMove(event) {
    if (!selectionMode || !dragStart) return;

    const point = getPointerPercentage(event);

    if (point) {
      setDraftArea(
        normaliseRectangle(dragStart, point),
      );
    }
  }

  function finishAreaSelection(event) {
    if (!selectionMode || !dragStart) return;

    const point = getPointerPercentage(event);

    const completedArea = point
      ? normaliseRectangle(dragStart, point)
      : draftArea;

    if (
      completedArea?.width >= 0.5 &&
      completedArea?.height >= 0.5
    ) {
      const startTime = Math.max(
        Number(videoRef.current?.currentTime) ||
          0,
        0,
      );

      const endTime = Math.min(
        startTime + 5,
        videoDuration || startTime + 5,
      );

      setRemovalAreas((currentAreas) =>
        [
          ...currentAreas,
          {
            ...completedArea,
            startTime,
            endTime: Math.max(
              endTime,
              startTime + 0.1,
            ),
          },
        ].slice(0, MAX_REMOVAL_AREAS),
      );
    } else {
      setError(
        "Drag a larger rectangle around the text.",
      );
    }

    setSelectionMode(false);
    setDragStart(null);
    setDraftArea(null);
  }

  function removeMarkedArea(areaIndex) {
    setRemovalAreas((currentAreas) =>
      currentAreas.filter(
        (_, index) => index !== areaIndex,
      ),
    );
  }

  function updateAreaTime(
    areaIndex,
    field,
    value,
  ) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return;
    }

    setRemovalAreas((currentAreas) =>
      currentAreas.map((area, index) => {
        if (index !== areaIndex) {
          return area;
        }

        return {
          ...area,
          [field]: Math.max(
            numericValue,
            0,
          ),
        };
      }),
    );
  }

  function startVideoProcessing() {
    if (
      !selectedFile ||
      !rightsConfirmed ||
      removalAreas.length === 0
    ) {
      return;
    }

    const formData = new FormData();

    formData.append("video", selectedFile);
    formData.append(
      "rightsConfirmed",
      "true",
    );
    formData.append(
      "removalAreas",
      JSON.stringify(removalAreas),
    );

    fetcher.submit(formData, {
      method: "post",
      encType: "multipart/form-data",
    });
  }

  const visibleAreas = draftArea
    ? [...removalAreas, draftArea]
    : removalAreas;

  return (
    <s-page heading="Video Text Removal">
      <section className={styles.mediaCard}>
        <s-button
          href="/app/media-tools"
          variant="primary"
        >
          ← Back to Media Tools
        </s-button>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Upload Video</s-heading>

        <s-paragraph>
          Upload an authorised product video and
          mark the areas containing text or
          overlays that should be removed.
        </s-paragraph>

        <input
          key={inputKey}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={handleFileChange}
        />

        <s-paragraph>
          Accepted formats: MP4, WEBM and MOV.
          Maximum file size: 200 MB.
        </s-paragraph>

        {error && (
          <s-banner tone="critical">
            {error}
          </s-banner>
        )}
      </section>

      {selectedFile && (
        <section className={styles.mediaCard}>
          <s-heading>Original Video</s-heading>

          <s-paragraph>
            File: {selectedFile.name}
          </s-paragraph>

          <s-paragraph>
            File size:{" "}
            {(
              selectedFile.size /
              (1024 * 1024)
            ).toFixed(2)}{" "}
            MB
          </s-paragraph>

          <div
            ref={previewContainerRef}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: "1280px",
              lineHeight: 0,
              backgroundColor: "#000000",
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <video
              ref={videoRef}
              src={previewUrl}
              controls={!selectionMode}
              onLoadedMetadata={(event) => {
                setVideoDuration(
                  Number(
                    event.currentTarget.duration,
                  ) || 0,
                );
              }}
              style={{
                display: "block",
                width: "100%",
                height: "auto",
              }}
            >
              Your browser does not support video
              playback.
            </video>

            {visibleAreas.map(
              (area, index) => (
                <div
                  key={`${index}-${area.x}-${area.y}`}
                  style={{
                    position: "absolute",
                    left: `${area.x}%`,
                    top: `${area.y}%`,
                    width: `${area.width}%`,
                    height: `${area.height}%`,
                    border:
                      "3px solid #ff2d2d",
                    backgroundColor:
                      "rgba(255, 45, 45, 0.18)",
                    boxSizing: "border-box",
                    pointerEvents: "none",
                  }}
                />
              ),
            )}

            {selectionMode && (
              <div
                role="presentation"
                onPointerDown={
                  handlePointerDown
                }
                onPointerMove={
                  handlePointerMove
                }
                onPointerUp={
                  finishAreaSelection
                }
                style={{
                  position: "absolute",
                  inset: 0,
                  cursor: "crosshair",
                  touchAction: "none",
                  backgroundColor:
                    "rgba(0, 0, 0, 0.05)",
                }}
              />
            )}
          </div>

          <s-paragraph>
            Pause on a clear frame, select Mark
            Text Area, then drag a tight rectangle
            around the writing. Add more areas
            when required.
          </s-paragraph>

          <s-button
            variant="primary"
            disabled={
              selectionMode ||
              removalAreas.length >=
                MAX_REMOVAL_AREAS
            }
            onClick={beginAreaSelection}
          >
            {selectionMode
              ? "Drag Around the Text"
              : "Mark Text Area"}
          </s-button>

          {selectionMode && (
            <s-button
              onClick={() => {
                setSelectionMode(false);
                setDragStart(null);
                setDraftArea(null);
              }}
            >
              Cancel Marking
            </s-button>
          )}

          {removalAreas.length > 0 && (
            <div>
              <s-heading>
                Marked Areas
              </s-heading>

              {removalAreas.map(
                (area, index) => (
                  <p key={index}>
                    Text area {index + 1}:{" "}
                    <label>
                      Start (seconds){" "}
                      <input
                        type="number"
                        min="0"
                        max={
                          videoDuration ||
                          undefined
                        }
                        step="0.1"
                        value={area.startTime}
                        onChange={(event) =>
                          updateAreaTime(
                            index,
                            "startTime",
                            event.target.value,
                          )
                        }
                      />
                    </label>{" "}
                    <label>
                      End (seconds){" "}
                      <input
                        type="number"
                        min="0.1"
                        max={
                          videoDuration ||
                          undefined
                        }
                        step="0.1"
                        value={area.endTime}
                        onChange={(event) =>
                          updateAreaTime(
                            index,
                            "endTime",
                            event.target.value,
                          )
                        }
                      />
                    </label>{" "}
                    <button
                      type="button"
                      onClick={() =>
                        removeMarkedArea(index)
                      }
                    >
                      Remove marking
                    </button>
                  </p>
                ),
              )}
            </div>
          )}

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
              setRightsConfirmed(
                event.target.checked,
              )
            }
          />{" "}
          I confirm that I own this media or have
          permission to modify and remove its
          text, watermarks or overlays for
          promotional purposes in my store or
          stores only.
        </label>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>
          Fast Text Removal
        </s-heading>

        <s-unordered-list>
          <s-list-item>
            Removes the areas you mark on the
            video
          </s-list-item>

          <s-list-item>
            Retains the original video length and
            audio
          </s-list-item>

          <s-list-item>
            Processes locally without translation
            or an external AI queue
          </s-list-item>

          <s-list-item>
            Uses one video credit when credits are
            connected
          </s-list-item>
        </s-unordered-list>

        <s-button
          variant="primary"
          disabled={
            !selectedFile ||
            !rightsConfirmed ||
            removalAreas.length === 0
          }
          onClick={() =>
            setSetupStarted(true)
          }
        >
          Review Text Removal
        </s-button>
      </section>

      {setupStarted && selectedFile && (
        <section className={styles.mediaCard}>
          <s-heading>
            Ready to Process
          </s-heading>

          <s-banner tone="success">
            Video accepted with{" "}
            {removalAreas.length} marked text area
            {removalAreas.length === 1
              ? ""
              : "s"}
            .
          </s-banner>

          <s-paragraph>
            Each marked area will apply only
            between its selected start and end
            times.
          </s-paragraph>

          {processingError && (
            <s-banner tone="critical">
              {processingError}
            </s-banner>
          )}

          <s-button
            variant="primary"
            disabled={
              isProcessing ||
              removalAreas.length === 0
            }
            onClick={startVideoProcessing}
          >
            {isProcessing
              ? "Removing Video Text..."
              : "Start Text Removal"}
          </s-button>
        </section>
      )}

      {completedVideoUrl && (
        <section className={styles.mediaCard}>
          <s-heading>
            Completed Video
          </s-heading>

          <s-banner tone="success">
            Video text removal completed
            successfully. Review the result before
            downloading.
          </s-banner>

          <s-paragraph>
            Text areas removed:{" "}
            {removalAreaCount}
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
            Your browser does not support video
            playback.
          </video>

          <p>
            <a
              href={completedVideoUrl}
              download="GEANOS-text-removed-video.mp4"
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