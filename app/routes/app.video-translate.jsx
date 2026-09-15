import { randomUUID } from "node:crypto";

import { useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getMediaCreditAccount,
  InsufficientMediaCreditsError,
  refundMediaCredit,
  reserveMediaCredit,
} from "../services/media-credits.server";
import {
  getVideoTranslationJob,
  startVideoTranslationJob,
} from "../services/video-translation-job-manager.server";
import styles from "../styles/media-tools.module.css";

const MAX_VIDEO_SIZE = 200 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const LANGUAGES = ["auto", "chinese", "japanese", "korean", "other"];

function parseRemovalAreas(value) {
  try {
    const areas = JSON.parse(value || "[]");
    return Array.isArray(areas)
      ? areas.filter((area) =>
          area?.maskDataUrl?.startsWith("data:image/png;base64,") &&
          Number(area.width) >= 0.5 && Number(area.height) >= 0.5 &&
          Number(area.endTime) > Number(area.startTime),
        ).slice(0, 1)
      : [];
  } catch {
    return [];
  }
}

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const account = await getMediaCreditAccount(session.shop);
  return { creditBalance: account.balance };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  console.log("[VIDEO TRANSLATION] Authenticated request; reading submitted video data.");
  const formData = await request.formData();
  console.log("[VIDEO TRANSLATION] Submitted video data received.");

  if (formData.get("intent") === "status") {
    const job = getVideoTranslationJob(formData.get("jobId"));
    if (!job) return { error: "The translation job is no longer available." };
    const account = await getMediaCreditAccount(session.shop);
    return { ...job, creditBalance: account.balance };
  }

  const videoFile = formData.get("video");
  const sourceLanguage = String(formData.get("sourceLanguage") || "auto");
  const startTime = Number(formData.get("startTime"));
  const endTime = Number(formData.get("endTime"));
  const passNumber = Math.max(Number(formData.get("passNumber")) || 1, 1);
  const removalAreas = parseRemovalAreas(formData.get("removalAreas"));

  if (formData.get("rightsConfirmed") !== "true") {
    return { error: "Confirm that you own this video or have permission to translate and edit it." };
  }
  if (!videoFile || typeof videoFile.arrayBuffer !== "function") {
    return { error: "Please select a video before translating." };
  }
  if (!VIDEO_TYPES.includes(videoFile.type)) {
    return { error: "Please upload an MP4, WEBM or MOV video file." };
  }
  if (videoFile.size > MAX_VIDEO_SIZE) {
    return { error: "The selected video is larger than the 200 MB limit." };
  }
  if (!LANGUAGES.includes(sourceLanguage)) {
    return { error: "Please select a valid original language." };
  }
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime < 0 || endTime <= startTime) {
    return { error: "Set the start time and finish time for one written phrase before translating." };
  }
  if (removalAreas.length !== 1) {
    return { error: "Paint over one written phrase before translating." };
  }

  const creditRequestId = `video-translate:${randomUUID()}`;
  let reserved = false;
  try {
    console.log("[VIDEO TRANSLATION] Reserving one processing credit.");
    await reserveMediaCredit({
      shop: session.shop,
      processingType: "video_translate",
      requestId: creditRequestId,
    });
    reserved = true;
    console.log("[VIDEO TRANSLATION] Credit reserved; creating background job.");
    const jobId = startVideoTranslationJob({
      videoFile, sourceLanguage, startTime, endTime, removalAreas,
      passNumber, creditRequestId,
    });
    const account = await getMediaCreditAccount(session.shop);
    console.log(`[VIDEO TRANSLATION] Job ${jobId} queued successfully.`);
    return { jobId, status: "queued", creditBalance: account.balance };
  } catch (error) {
    if (reserved) {
      try { await refundMediaCredit(creditRequestId); }
      catch (refundError) { console.error("Video translation credit refund failed:", refundError); }
    }
    console.error("Video translation job could not be started:", error);
    if (error instanceof InsufficientMediaCreditsError) {
      return { error: "No credits are available. Please purchase or add credits before processing." };
    }
    return { error: "The video could not be submitted for translation. Please try again." };
  }
}

function displayTime(value) {
  const seconds = Number(value) || 0;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, "0")}`;
}

const videoStyle = {
  display: "block", width: "100%", maxHeight: "600px",
  borderRadius: "8px", backgroundColor: "#000000",
};

export default function VideoTranslate() {
  const { creditBalance: openingBalance } = useLoaderData();
  const fetcher = useFetcher();
  const statusFetcher = useFetcher();
  const videoRef = useRef(null);
  const paintCanvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const activeStrokeRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [jobId, setJobId] = useState("");
  const [completedVideoUrl, setCompletedVideoUrl] = useState("");
  const [passNumber, setPassNumber] = useState(1);
  const [creditBalance, setCreditBalance] = useState(openingBalance);
  const [localError, setLocalError] = useState("");
  const [submissionStarted, setSubmissionStarted] = useState(false);
  const [painting, setPainting] = useState(false);
  const [paintStrokes, setPaintStrokes] = useState([]);

  const failed = statusFetcher.data?.status === "failed";
  const submitting = submissionStarted || fetcher.state !== "idle";
  const processing = submitting || (Boolean(jobId) && !completedVideoUrl && !failed);

  useEffect(() => {
    if (!selectedFile) { setPreviewUrl(""); return undefined; }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  useEffect(() => {
    if (fetcher.data?.jobId) {
      setJobId(fetcher.data.jobId);
      setSubmissionStarted(false);
    }
    if (fetcher.data?.error) setSubmissionStarted(false);
    if (Number.isFinite(fetcher.data?.creditBalance)) setCreditBalance(fetcher.data.creditBalance);
  }, [fetcher.data]);

  useEffect(() => {
    if (Number.isFinite(statusFetcher.data?.creditBalance)) setCreditBalance(statusFetcher.data.creditBalance);
    if (statusFetcher.data?.completedVideoUrl) setCompletedVideoUrl(statusFetcher.data.completedVideoUrl);
  }, [statusFetcher.data]);

  useEffect(() => {
    if (!jobId || completedVideoUrl || failed) return undefined;
    const poll = () => statusFetcher.submit({ intent: "status", jobId }, { method: "post" });
    poll();
    const timer = window.setInterval(poll, 2000);
    return () => window.clearInterval(timer);
  }, [jobId, completedVideoUrl, failed]);

  function chooseFile(file) {
    setLocalError("");
    if (!file) { setSelectedFile(null); return; }
    if (!VIDEO_TYPES.includes(file.type)) {
      setLocalError("Please select an MP4, WEBM or MOV video file."); return;
    }
    if (file.size > MAX_VIDEO_SIZE) {
      setLocalError("The selected video is larger than the 200 MB limit."); return;
    }
    setSelectedFile(file); setStartTime(null); setEndTime(null);
    setPainting(false); setPaintStrokes([]);
    setCompletedVideoUrl(""); setJobId("");
  }

  function recordStart() {
    if (!videoRef.current) return;
    videoRef.current.pause();
    const value = Math.max(videoRef.current.currentTime - 1, 0);
    videoRef.current.currentTime = value;
    setCurrentTime(value); setStartTime(value); setEndTime(null); setLocalError("");
  }

  function recordFinish() {
    if (!videoRef.current || startTime === null) {
      setLocalError("Set the start time first."); return;
    }
    videoRef.current.pause();
    if (videoRef.current.currentTime <= startTime) {
      setLocalError("The finish time must be after the start time."); return;
    }
    const finish = videoRef.current.currentTime;
    setCurrentTime(finish); setEndTime(finish); setLocalError("");
    videoRef.current.currentTime = Math.min(startTime + 1, finish);
  }

  function sizeCanvases() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) return;
    for (const canvas of [paintCanvasRef.current, maskCanvasRef.current]) {
      if (!canvas) continue;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
  }

  function canvasPoint(event) {
    const canvas = paintCanvasRef.current;
    const bounds = canvas?.getBoundingClientRect();
    if (!canvas || !bounds) return null;
    return {
      x: Math.min(Math.max((event.clientX - bounds.left) * canvas.width / bounds.width, 0), canvas.width),
      y: Math.min(Math.max((event.clientY - bounds.top) * canvas.height / bounds.height, 0), canvas.height),
    };
  }

  function drawLine(canvas, from, to) {
    const context = canvas?.getContext("2d");
    if (!context) return;
    context.save();
    context.strokeStyle = canvas === paintCanvasRef.current ? "rgba(255,35,35,0.70)" : "white";
    context.fillStyle = context.strokeStyle;
    context.lineWidth = Math.max(canvas.width * 0.025, 8);
    context.lineCap = "round"; context.lineJoin = "round";
    context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
    context.beginPath(); context.arc(to.x, to.y, context.lineWidth / 2, 0, Math.PI * 2); context.fill();
    context.restore();
  }

  function redraw(strokes) {
    for (const canvas of [paintCanvasRef.current, maskCanvasRef.current]) {
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }
    for (const stroke of strokes) {
      stroke.forEach((point, index) => drawLine(paintCanvasRef.current, stroke[Math.max(index - 1, 0)], point));
      stroke.forEach((point, index) => drawLine(maskCanvasRef.current, stroke[Math.max(index - 1, 0)], point));
    }
  }

  function pointerDown(event) {
    if (!painting || !videoRef.current?.paused) return;
    const point = canvasPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activeStrokeRef.current = [point];
    drawLine(paintCanvasRef.current, point, point); drawLine(maskCanvasRef.current, point, point);
  }

  function pointerMove(event) {
    const stroke = activeStrokeRef.current;
    const point = canvasPoint(event);
    if (!stroke || !point) return;
    const previous = stroke[stroke.length - 1]; stroke.push(point);
    drawLine(paintCanvasRef.current, previous, point); drawLine(maskCanvasRef.current, previous, point);
  }

  function pointerUp() {
    if (!activeStrokeRef.current) return;
    setPaintStrokes((strokes) => [...strokes, activeStrokeRef.current]);
    activeStrokeRef.current = null;
  }

  function createRemovalArea() {
    const mask = maskCanvasRef.current;
    const points = paintStrokes.flat();
    if (!mask || points.length === 0 || startTime === null || endTime === null) return null;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = mask.width; exportCanvas.height = mask.height;
    const context = exportCanvas.getContext("2d");
    context.fillStyle = "black"; context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    context.drawImage(mask, 0, 0);
    const xs = points.map((point) => point.x); const ys = points.map((point) => point.y);
    const padding = Math.max(mask.width * 0.02, 8);
    const left = Math.max(Math.min(...xs) - padding, 0);
    const top = Math.max(Math.min(...ys) - padding, 0);
    const right = Math.min(Math.max(...xs) + padding, mask.width);
    const bottom = Math.min(Math.max(...ys) + padding, mask.height);
    return {
      x: left / mask.width * 100, y: top / mask.height * 100,
      width: (right - left) / mask.width * 100, height: (bottom - top) / mask.height * 100,
      startTime, endTime, maskDataUrl: exportCanvas.toDataURL("image/png"),
      cleanupMethod: "brush", cleanupPasses: 1,
      processingStage: "remove", repairMethod: "propainter",
    };
  }

  function submitTranslation() {
    const removalArea = createRemovalArea();
    if (!selectedFile || !removalArea || !rightsConfirmed) return;
    setLocalError(""); setCompletedVideoUrl(""); setSubmissionStarted(true);
    const data = new FormData();
    data.set("intent", "start"); data.set("video", selectedFile);
    data.set("sourceLanguage", sourceLanguage); data.set("rightsConfirmed", "true");
    data.set("startTime", String(startTime)); data.set("endTime", String(endTime));
    data.set("passNumber", String(passNumber));
    data.set("removalAreas", JSON.stringify([removalArea]));
    fetcher.submit(data, { method: "post", encType: "multipart/form-data" });
  }

  async function continueTranslation() {
    try {
      const response = await fetch(completedVideoUrl);
      const blob = await response.blob();
      const nextPass = passNumber + 1;
      setSelectedFile(new File([blob], `GEANOS-translated-pass-${passNumber}.mp4`, { type: "video/mp4" }));
      setPassNumber(nextPass); setStartTime(null); setEndTime(null);
      setPainting(false); setPaintStrokes([]);
      setJobId(""); setCompletedVideoUrl(""); setLocalError("");
    } catch {
      setLocalError("The completed video could not be reloaded. Download it, then upload that file for the next pass.");
    }
  }

  const error = localError || statusFetcher.data?.error || fetcher.data?.error;
  const ready = selectedFile && rightsConfirmed && startTime !== null && endTime !== null && paintStrokes.length > 0 && !processing;

  return (
    <s-page heading="Video Text Translation">
      <section className={styles.mediaCard}>
        <s-button href="/app/video-tools" variant="primary">← Back to Video Tools</s-button>
      </section>
      <section className={styles.mediaCard}>
        <h2 className={styles.majorHeading}>Translate One Written Phrase at a Time</h2>
        <s-paragraph>Set the start and finish time for one phrase. GEANOS will translate it, remove the original writing, patch the background and place the English wording into the finished video.</s-paragraph>
        <s-banner tone="info">Translation and video patching can take several minutes. Please be patient and keep this workshop open while the job is processing.</s-banner>
        {passNumber > 1 && <s-banner tone="warning">This is pass {passNumber}. If a multi-pass job fails, that pass credit is forfeited.</s-banner>}
      </section>
      <section className={styles.mediaCard}>
        <h2 className={styles.majorHeading}>1. Upload and Preview Video</h2>
        <input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={processing} onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
        <s-paragraph>MP4, WEBM or MOV; maximum 200 MB. Credits available: {creditBalance}.</s-paragraph>
        {previewUrl && <div style={{ position: "relative", width: "100%" }}>
          <video ref={videoRef} src={previewUrl} controls={!painting}
            onLoadedMetadata={sizeCanvases}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            style={videoStyle} />
          <canvas ref={paintCanvasRef}
            onPointerDown={pointerDown} onPointerMove={pointerMove}
            onPointerUp={pointerUp} onPointerCancel={pointerUp}
            style={{
              display: painting ? "block" : "none", position: "absolute",
              inset: 0, width: "100%", height: "100%", cursor: "crosshair",
              touchAction: "none",
            }} />
          <canvas ref={maskCanvasRef} style={{ display: "none" }} />
        </div>}
      </section>
      <section className={styles.mediaCard}>
        <h2 className={styles.majorHeading}>2. Set the Phrase Start and Finish</h2>
        <s-paragraph>Current video time: {displayTime(currentTime)}</s-paragraph>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
          <s-button onClick={recordStart} disabled={!selectedFile || processing}>Back 1 Second &amp; Set Start</s-button>
          <s-button onClick={recordFinish} disabled={!selectedFile || startTime === null || processing}>Set Finish Time</s-button>
        </div>
        <s-paragraph>Start: {startTime === null ? "Not set" : displayTime(startTime)} | Finish: {endTime === null ? "Not set" : displayTime(endTime)}</s-paragraph>
      </section>
      <section className={styles.mediaCard}>
        <h2 className={styles.majorHeading}>3. Paint Over the Original Writing</h2>
        <s-paragraph>After setting the finish time, the video returns to the selected section. Paint precisely over only the writing that must be translated.</s-paragraph>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <s-button variant={painting ? "primary" : undefined}
            disabled={!selectedFile || startTime === null || endTime === null || processing}
            onClick={() => { videoRef.current?.pause(); setPainting((value) => !value); }}>
            {painting ? "Finish Painting" : "Start Painting"}
          </s-button>
          <s-button disabled={paintStrokes.length === 0 || processing}
            onClick={() => { const next = paintStrokes.slice(0, -1); setPaintStrokes(next); redraw(next); }}>
            Undo Last Stroke
          </s-button>
          <s-button disabled={paintStrokes.length === 0 || processing}
            onClick={() => { setPaintStrokes([]); redraw([]); }}>
            Clear Paint
          </s-button>
        </div>
        <s-paragraph>{paintStrokes.length > 0 ? "Painted area ready." : "No painted area yet."}</s-paragraph>
      </section>
      <section className={styles.mediaCard}>
        <h2 className={styles.majorHeading}>4. Translation Settings</h2>
        <label>Original language{" "}<select value={sourceLanguage} disabled={processing} onChange={(event) => setSourceLanguage(event.target.value)}><option value="auto">Detect automatically</option><option value="chinese">Chinese</option><option value="japanese">Japanese</option><option value="korean">Korean</option><option value="other">Other language</option></select></label>
        <div style={{ marginTop: "12px" }}><label><input type="checkbox" checked={rightsConfirmed} disabled={processing} onChange={(event) => setRightsConfirmed(event.target.checked)} /> I confirm that I own this video or have permission to translate and edit it.</label></div>
        {processing && <div style={{ marginTop: "12px" }}><s-banner tone="info">{submitting ? "Your video is uploading and the translation job is being prepared. Please keep this page open." : "Translation, painted-text removal and background patching are now processing. This can take several minutes."}</s-banner></div>}
        {error && <div style={{ marginTop: "12px" }}><s-banner tone="critical">{error}{statusFetcher.data?.creditRefunded ? " Your credit was refunded." : ""}</s-banner></div>}
        <div style={{ marginTop: "16px" }}><s-button variant="primary" tone={processing ? "critical" : undefined} disabled={!ready || processing} loading={processing} onClick={submitTranslation}>{submitting ? "Submitting Video…" : processing ? "Translation Processing…" : "Start Video Translation — 1 Credit"}</s-button></div>
      </section>
      {completedVideoUrl && <section className={styles.mediaCard}>
        <h2 className={styles.majorHeading}>Translation Pass Completed</h2>
        <video src={completedVideoUrl} controls style={videoStyle} />
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "16px" }}>
          <a href={completedVideoUrl} download={`GEANOS-translated-video-pass-${passNumber}.mp4`}>Download Translated Video</a>
          <s-button variant="primary" onClick={continueTranslation}>Continue Translating This Video</s-button>
        </div>
      </section>}
    </s-page>
  );
}
