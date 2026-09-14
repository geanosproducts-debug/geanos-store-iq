import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getVideoJob,
  startVideoJob,
} from "../services/video-job-manager.server";
import styles from "../styles/media-tools.module.css";

const MAX_VIDEO_SIZE = 200 * 1024 * 1024;
const DEFAULT_BRUSH_SIZE = 4;
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
        maskDataUrl:
          typeof area?.maskDataUrl === "string" &&
          area.maskDataUrl.startsWith("data:image/png;base64,") &&
          area.maskDataUrl.length <= 8_000_000
            ? area.maskDataUrl
            : "",
        cleanupMethod: "brush",
        cleanupPasses: 1,
        processingStage:
          area?.processingStage === "repair"
            ? "repair"
            : "remove",
        repairMethod:
          area?.repairMethod === "void"
            ? "void"
            : "propainter",
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
      .filter((area) => area.maskDataUrl)
      .slice(0, 1);
  } catch {
    return [];
  }
}

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
        removalAreaCount:
          job.removalAreaCount,
        error: job.error,
      };
    }

    const videoFile = formData.get("video");
    const rightsConfirmed =
      formData.get("rightsConfirmed") ===
      "true";
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

    if (removalAreas.length === 0) {
      return {
        error:
          "Paint over the writing before processing.",
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

export default function VideoCleanup() {
  const fetcher = useFetcher();
  const statusFetcher = useFetcher();
  const previewContainerRef = useRef(null);
  const videoRef = useRef(null);
  const paintCanvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const currentStrokeRef = useRef(null);

  const [selectedFile, setSelectedFile] =
    useState(null);
  const [previewUrl, setPreviewUrl] =
    useState("");
  const [
    rightsConfirmed,
    setRightsConfirmed,
  ] = useState(false);
  const [removalAreas, setRemovalAreas] =
    useState([]);
  const [selectionMode, setSelectionMode] =
    useState(false);
  const [brushSize, setBrushSize] =
    useState(DEFAULT_BRUSH_SIZE);
  const [brushTool, setBrushTool] =
    useState("paint");
  const [processingStage, setProcessingStage] =
    useState("remove");
  const [processingEngine, setProcessingEngine] =
    useState("propainter");
  const [paintStrokes, setPaintStrokes] =
    useState([]);
  const [brushCursor, setBrushCursor] =
    useState(null);
  const [currentVideoTime, setCurrentVideoTime] =
    useState(0);
  const [recordedStartTime, setRecordedStartTime] =
    useState(null);
  const [recordedEndTime, setRecordedEndTime] =
    useState(null);
  const [videoIsPlaying, setVideoIsPlaying] =
    useState(false);
  const [dismissedCompletedJobId, setDismissedCompletedJobId] =
    useState(null);
  const [error, setError] = useState("");
  const [setupStarted, setSetupStarted] =
    useState(false);
  const [inputKey, setInputKey] =
    useState(0);
  const [
    videoDuration,
    setVideoDuration,
  ] = useState(0);

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

  const processingError =
    statusData?.error;
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

    return () =>
      URL.revokeObjectURL(videoUrl);
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

    const intervalId =
      window.setInterval(
        checkJobStatus,
        2000,
      );

    return () =>
      window.clearInterval(intervalId);
  }, [jobId, jobStatus]);

  function handleFileChange(event) {
    const file =
      event.target.files?.[0];

    setError("");
    setSetupStarted(false);
    setRemovalAreas([]);
    setSelectionMode(false);
    setPaintStrokes([]);
    currentStrokeRef.current = null;
    setVideoDuration(0);
    setCurrentVideoTime(0);
    setRecordedStartTime(null);
    setRecordedEndTime(null);
    setVideoIsPlaying(false);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (
      !ACCEPTED_VIDEO_TYPES.includes(
        file.type,
      )
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
    setDismissedCompletedJobId(jobId || null);
    setSelectedFile(null);
    setRightsConfirmed(false);
    setRemovalAreas([]);
    setSelectionMode(false);
    setPaintStrokes([]);
    currentStrokeRef.current = null;
    setError("");
    setSetupStarted(false);
    setInputKey(
      (currentKey) => currentKey + 1,
    );
    setVideoDuration(0);
    setCurrentVideoTime(0);
    setRecordedStartTime(null);
    setRecordedEndTime(null);
    setVideoIsPlaying(false);
  }

  async function continueEditingCompletedVideo() {
    if (!completedVideoUrl) return;

    try {
      const completedResponse = await fetch(completedVideoUrl);
      const completedBlob = await completedResponse.blob();
      const continuedVideoFile = new File(
        [completedBlob],
        "GEANOS-continued-video.mp4",
        {
          type: completedBlob.type || "video/mp4",
        },
      );

      setDismissedCompletedJobId(jobId || null);
      setSetupStarted(false);
      setRemovalAreas([]);
      setSelectionMode(false);
      setPaintStrokes([]);
      currentStrokeRef.current = null;
      setVideoDuration(0);
      setCurrentVideoTime(0);
      setRecordedStartTime(null);
      setRecordedEndTime(null);
      setVideoIsPlaying(false);
      setError("");
      setInputKey((currentKey) => currentKey + 1);
      setSelectedFile(continuedVideoFile);

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch {
      setError(
        "The completed video could not be reloaded. Download it and upload it again.",
      );
    }
  }

  function getCanvasPoint(event) {
    const canvas = paintCanvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();

    return {
      x: Math.min(
        Math.max(
          ((event.clientX - bounds.left) / bounds.width) * canvas.width,
          0,
        ),
        canvas.width,
      ),
      y: Math.min(
        Math.max(
          ((event.clientY - bounds.top) / bounds.height) * canvas.height,
          0,
        ),
        canvas.height,
      ),
    };
  }

  function drawStrokeSegment(canvas, stroke, from, to) {
    const context = canvas?.getContext("2d");
    if (!context) return;

    context.save();
    context.globalCompositeOperation =
      stroke.tool === "erase" ? "destination-out" : "source-over";
    context.strokeStyle =
      canvas === paintCanvasRef.current
        ? "rgba(255, 35, 35, 0.68)"
        : "white";
    context.fillStyle = context.strokeStyle;
    context.lineWidth = stroke.size;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.beginPath();
    context.arc(to.x, to.y, stroke.size / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function redrawPaint(strokes) {
    const paintCanvas = paintCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!paintCanvas || !maskCanvas) return;

    paintCanvas.getContext("2d")?.clearRect(
      0, 0, paintCanvas.width, paintCanvas.height,
    );
    maskCanvas.getContext("2d")?.clearRect(
      0, 0, maskCanvas.width, maskCanvas.height,
    );

    for (const stroke of strokes) {
      stroke.points.forEach((point, index) => {
        const previousPoint = stroke.points[Math.max(index - 1, 0)];
        drawStrokeSegment(paintCanvas, stroke, previousPoint, point);
        drawStrokeSegment(maskCanvas, stroke, previousPoint, point);
      });
    }
  }

  function createMaskDataUrl() {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return "";

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = maskCanvas.width;
    exportCanvas.height = maskCanvas.height;
    const context = exportCanvas.getContext("2d");
    context.fillStyle = "black";
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    context.drawImage(maskCanvas, 0, 0);
    return exportCanvas.toDataURL("image/png");
  }

  function saveCombinedMask(strokes) {
    if (strokes.length === 0) {
      setRemovalAreas([]);
      return;
    }

    const currentTime = Math.max(videoRef.current?.currentTime || 0, 0);

    setRemovalAreas((currentAreas) => {
      const existingArea = currentAreas[0];
      const startTime = recordedStartTime ??
        existingArea?.startTime ?? currentTime;
      const endTime = recordedEndTime ??
        existingArea?.endTime ?? Math.min(
          currentTime + 5,
          videoDuration || currentTime + 5,
        );

      return [{
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        startTime,
        endTime: Math.max(endTime, startTime + 0.1),
        maskDataUrl: createMaskDataUrl(),
        cleanupMethod: "brush",
        cleanupPasses: 1,
        processingStage,
        repairMethod: processingEngine,
      }];
    });
  }

  function moveVideoBackward() {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    const startTime = Math.max(
      video.currentTime - 1,
      0,
    );
    video.currentTime = startTime;
    setCurrentVideoTime(startTime);
    setRecordedStartTime(startTime);
    setRecordedEndTime(null);
    setRemovalAreas((currentAreas) =>
      currentAreas.map((area) => ({
        ...area,
        startTime,
        endTime: Math.max(
          area.endTime,
          startTime + 0.1,
        ),
      })),
    );
    setError("");
  }

  function setFinishTime() {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    const finishTime = Math.max(video.currentTime, 0);
    setRecordedEndTime(finishTime);
    setRemovalAreas((currentAreas) =>
      currentAreas.map((area) => ({
        ...area,
        endTime: Math.max(
          finishTime,
          (recordedStartTime ?? area.startTime) + 0.1,
        ),
      })),
    );
    const paintFrameTime = recordedStartTime === null
      ? finishTime
      : Math.min(recordedStartTime + 1, finishTime);
    video.currentTime = paintFrameTime;
    setCurrentVideoTime(paintFrameTime);
    setError("");
  }

  function toggleVideoPlayback() {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }

  function seekVideo(value) {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    video.currentTime = Number(value) || 0;
    setCurrentVideoTime(video.currentTime);
  }

  function beginAreaSelection() {
    videoRef.current?.pause();
    setSelectionMode(true);
    setError("");
  }

  function handlePointerDown(event) {
    if (!selectionMode) return;

    if (!videoRef.current?.paused) return;

    const point = getCanvasPoint(event);

    if (!point) return;

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );

    const canvas = paintCanvasRef.current;
    const stroke = {
      tool: brushTool,
      size: Math.max((brushSize / 100) * canvas.width, 2),
      points: [point],
    };
    currentStrokeRef.current = stroke;
    drawStrokeSegment(canvas, stroke, point, point);
    drawStrokeSegment(maskCanvasRef.current, stroke, point, point);
  }

  function handlePointerMove(event) {
    if (!selectionMode) return;

    const point = getCanvasPoint(event);
    const canvas = paintCanvasRef.current;
    if (point && canvas) {
      setBrushCursor({
        x: (point.x / canvas.width) * 100,
        y: (point.y / canvas.height) * 100,
      });
    }

    const stroke = currentStrokeRef.current;
    if (!point || !stroke) return;

    const previousPoint = stroke.points[stroke.points.length - 1];
    stroke.points.push(point);
    drawStrokeSegment(canvas, stroke, previousPoint, point);
    drawStrokeSegment(maskCanvasRef.current, stroke, previousPoint, point);
  }

  function finishAreaSelection(event) {
    const stroke = currentStrokeRef.current;
    if (!selectionMode || !stroke) return;

    currentStrokeRef.current = null;
    const nextStrokes = [...paintStrokes, stroke];
    setPaintStrokes(nextStrokes);
    saveCombinedMask(nextStrokes);
  }

  function updateAreaTime(
    field,
    value,
  ) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return;
    }

    setRemovalAreas(
      (currentAreas) =>
        currentAreas.map((area) => ({
          ...area,
          [field]: Math.max(numericValue, 0),
        })),
    );
  }

  function updateProcessingStage(value) {
    const nextStage =
      value === "repair" ? "repair" : "remove";
    setProcessingStage(nextStage);
    setRemovalAreas((currentAreas) =>
      currentAreas.map((area) => ({
        ...area,
        processingStage: nextStage,
      })),
    );
  }

  function updateProcessingEngine(value) {
    const nextEngine =
      value === "void" ? "void" : "propainter";
    setProcessingEngine(nextEngine);
    setRemovalAreas((currentAreas) =>
      currentAreas.map((area) => ({
        ...area,
        repairMethod: nextEngine,
      })),
    );
  }

  function undoLastStroke() {
    const nextStrokes = paintStrokes.slice(0, -1);
    setPaintStrokes(nextStrokes);
    redrawPaint(nextStrokes);
    saveCombinedMask(nextStrokes);
  }

  function clearAllPaint() {
    setPaintStrokes([]);
    redrawPaint([]);
    setRemovalAreas([]);
    setBrushTool("paint");
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

    formData.append(
      "video",
      selectedFile,
    );
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

  return (
    <s-page heading="Video Text Removal">
      <section
        className={styles.mediaCard}
      >
        <s-button
          href="/app/media-tools"
          variant="primary"
        >
          ← Back to Media Tools
        </s-button>
      </section>

      <section
        className={styles.mediaCard}
      >
        <s-heading>
          Upload Video
        </s-heading>

        <s-paragraph>
          Upload an authorised product video
          and mark the areas containing text
          or overlays that should be removed.
        </s-paragraph>

        <input
          key={inputKey}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={handleFileChange}
        />

        <s-paragraph>
          Accepted formats: MP4, WEBM and
          MOV. Maximum file size: 200 MB.
        </s-paragraph>

        {error && (
          <s-banner tone="critical">
            {error}
          </s-banner>
        )}
      </section>

      {selectedFile && (
        <section
          className={styles.mediaCard}
        >
          <s-heading>
            Original Video
          </s-heading>

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
              backgroundColor:
                "#000000",
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <video
              ref={videoRef}
              src={previewUrl}
              controls={false}
              onLoadedMetadata={(
                event,
              ) => {
                setVideoDuration(
                  Number(
                    event.currentTarget
                      .duration,
                  ) || 0,
                );
                setCurrentVideoTime(0);
                const width = event.currentTarget.videoWidth;
                const height = event.currentTarget.videoHeight;
                for (const canvas of [
                  paintCanvasRef.current,
                  maskCanvasRef.current,
                ]) {
                  if (canvas) {
                    canvas.width = width;
                    canvas.height = height;
                  }
                }
                redrawPaint([]);
              }}
              onTimeUpdate={(event) =>
                setCurrentVideoTime(
                  event.currentTarget.currentTime,
                )
              }
              onPlay={() => setVideoIsPlaying(true)}
              onPause={() => setVideoIsPlaying(false)}
              onEnded={() => setVideoIsPlaying(false)}
              style={{
                display: "block",
                width: "100%",
                height: "auto",
              }}
            >
              Your browser does not support
              video playback.
            </video>

            <canvas
              ref={paintCanvasRef}
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
            <canvas
              ref={maskCanvasRef}
              aria-hidden="true"
              style={{ display: "none" }}
            />

            {selectionMode && brushCursor && (
              <div
                style={{
                  position: "absolute",
                  left: `${brushCursor.x}%`,
                  top: `${brushCursor.y}%`,
                  width: `${brushSize}%`,
                  aspectRatio: "1 / 1",
                  border: "2px solid #ff2323",
                  borderRadius: "50%",
                  backgroundColor: "rgba(255, 35, 35, 0.2)",
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "none",
                  zIndex: 2,
                }}
              />
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
                onPointerLeave={() =>
                  setBrushCursor(null)
                }
                style={{
                  position: "absolute",
                  inset: 0,
                  cursor: "cell",
                  touchAction: "none",
                  backgroundColor:
                    "rgba(0, 0, 0, 0.05)",
                }}
              />
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginTop: "10px",
            }}
          >
            <s-button onClick={toggleVideoPlayback}>
              {videoIsPlaying ? "Pause" : "Play"}
            </s-button>
            <input
              aria-label="Video position"
              type="range"
              min="0"
              max={videoDuration || 0}
              step="0.01"
              value={Math.min(currentVideoTime, videoDuration || 0)}
              onChange={(event) => seekVideo(event.target.value)}
              style={{ flex: 1 }}
            />
            <span>
              {currentVideoTime.toFixed(2)} seconds
            </span>
          </div>

          <s-paragraph>
            1. Pause where the writing first appears
            and set the start. 2. Play to where the
            writing disappears and set the finish.
            The video returns to the writing frame.
            3. Choose a brush size and paint over the
            writing. The red paint will not appear in
            the completed video.
          </s-paragraph>

          <s-button
            onClick={moveVideoBackward}
          >
            Back 1 Second & Set Start
          </s-button>

          <s-button
            onClick={setFinishTime}
            disabled={recordedStartTime === null}
          >
            Set Finish Time
          </s-button>

          <s-paragraph>
            Start: {recordedStartTime === null
              ? "Not set"
              : `${recordedStartTime.toFixed(3)} seconds`}
            {" | "}
            Finish: {recordedEndTime === null
              ? "Not set"
              : `${recordedEndTime.toFixed(3)} seconds`}
          </s-paragraph>

          <label style={{ margin: "0 10px" }}>
            Brush size{" "}
            <select
              value={selectionMode ? brushSize : ""}
              onChange={(event) => {
                setBrushSize(Number(event.target.value));
                beginAreaSelection();
              }}
            >
              <option value="" disabled>
                Select size
              </option>
              <option value="2">Small</option>
              <option value="4">Medium</option>
              <option value="7">Large</option>
              <option value="10">Extra Large</option>
            </select>
          </label>

          <s-button
            variant={brushTool === "paint" ? "primary" : undefined}
            onClick={() => {
              setBrushTool("paint");
              beginAreaSelection();
            }}
          >
            Paint
          </s-button>

          <s-button
            variant={brushTool === "erase" ? "primary" : undefined}
            disabled={paintStrokes.length === 0}
            onClick={() => {
              setBrushTool("erase");
              beginAreaSelection();
            }}
          >
            Eraser
          </s-button>

          {removalAreas.length > 0 && (
            <>
              <s-button
                onClick={undoLastStroke}
              >
                Undo Last Stroke
              </s-button>
              <s-button onClick={clearAllPaint}>
                Clear All Paint
              </s-button>
            </>
          )}

          {removalAreas.length > 0 && (
            <div>
              <s-heading>
                Painted Areas
              </s-heading>

              <s-banner tone="info">
                Only the stage selected below will run.
                All red paint is one combined mask,
                one processing operation and one credit.
              </s-banner>

              <p>
                <label>
                  Processing stage{" "}
                  <select
                    value={processingStage}
                    onChange={(event) =>
                      updateProcessingStage(event.target.value)
                    }
                  >
                    <option value="remove">
                      Stage 1 — Remove Text
                    </option>
                    <option value="repair">
                      Stage 2 — Repair Background
                    </option>
                  </select>
                </label>{" "}

                <label>
                  Processor{" "}
                  <select
                    value={processingEngine}
                    onChange={(event) =>
                      updateProcessingEngine(event.target.value)
                    }
                  >
                    <option value="propainter">
                      ProPainter
                    </option>
                    <option value="void">
                      VOID
                    </option>
                  </select>
                </label>
              </p>

              {removalAreas.map(
                (area) => (
                  <p key="combined-mask">
                    Repair time:{" "}
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
                        value={
                          area.startTime
                        }
                        onChange={(
                          event,
                        ) =>
                          updateAreaTime(
                            "startTime",
                            event.target
                              .value,
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
                        value={
                          area.endTime
                        }
                        onChange={(
                          event,
                        ) =>
                          updateAreaTime(
                            "endTime",
                            event.target
                              .value,
                          )
                        }
                      />
                    </label>
                  </p>
                ),
              )}
            </div>
          )}

          <s-button
            onClick={clearVideo}
          >
            Choose Different Video
          </s-button>
        </section>
      )}

      <section
        className={styles.mediaCard}
      >
        <s-heading>
          Content Rights
        </s-heading>

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
          I confirm that I own this media or
          have permission to modify and
          remove its text, watermarks or
          overlays for promotional purposes
          in my store or stores only.
        </label>
      </section>

      <section
        className={styles.mediaCard}
      >
        <s-heading>
          Painted Background Repair
        </s-heading>

        <s-unordered-list>
          <s-list-item>
            Removes only the area painted red
          </s-list-item>

          <s-list-item>
            Retains the original video length
            and audio
          </s-list-item>

          <s-list-item>
            Rebuilds the painted background with
            ProPainter
          </s-list-item>

          <s-list-item>
            Uses one video credit when
            credits are connected
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

      {setupStarted &&
        selectedFile && (
          <section
            className={
              styles.mediaCard
            }
          >
            <s-heading>
              Ready to Process
            </s-heading>

            <s-banner tone="success">
              Video accepted with{" "}
              {removalAreas.length} marked
              text area
              {removalAreas.length === 1
                ? ""
                : "s"}
              .
            </s-banner>

            <s-paragraph>
              Each marked area will apply
              only between its selected
              start and end times.
            </s-paragraph>

            <s-banner tone="warning">
              Process one writing section at a time.
              Video editing can take several minutes,
              so please keep this page open and wait
              patiently while processing completes.
              When finished, use Continue Editing This
              Video to remove or edit another section.
            </s-banner>

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
              onClick={
                startVideoProcessing
              }
            >
              {isProcessing
                ? "Removing Video Text..."
                : "Start Text Removal"}
            </s-button>
          </section>
        )}

      {completedVideoUrl &&
        dismissedCompletedJobId !== jobId && (
        <section
          className={styles.mediaCard}
        >
          <s-heading>
            Completed Video
          </s-heading>

          <s-banner tone="success">
            Video text removal completed
            successfully. Review the result
            before downloading.
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
              backgroundColor:
                "#000000",
            }}
          >
            Your browser does not support
            video playback.
          </video>

          <p>
            <a
              href={completedVideoUrl}
              download="GEANOS-text-removed-video.mp4"
            >
              Download Completed Video
            </a>
          </p>

          <s-button
            onClick={clearVideo}
          >
            Process Another Video
          </s-button>

          <s-button
            variant="primary"
            onClick={continueEditingCompletedVideo}
          >
            Continue Editing This Video
          </s-button>
        </section>
      )}
    </s-page>
  );
}
