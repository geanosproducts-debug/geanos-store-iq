import { useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { processPhoto } from "../services/photo-processor.server";
import {
  completeMediaCredit,
  getMediaCreditAccount,
  InsufficientMediaCreditsError,
  refundMediaCredit,
  reserveMediaCredit,
} from "../services/media-credits.server";
import styles from "../styles/media-tools.module.css";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const account = await getMediaCreditAccount(session.shop);

  return {
    creditBalance: account.balance,
  };
}
export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const imageFile = formData.get("image");
  const rightsConfirmed = formData.get("rightsConfirmed");
  const processingChoice = formData.get("processingChoice");
  const sourceLanguage = formData.get("sourceLanguage");
  const maskFile = formData.get("mask");
  const requestId = formData.get("requestId");

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const allowedChoices = ["translate", "cleanup"];
  const allowedLanguages = [
    "auto",
    "chinese",
    "japanese",
    "korean",
    "other",
  ];
if (!requestId) {
  return {
    error: "A photo-processing request ID is required.",
  };
}
  if (rightsConfirmed !== "true") {
    return {
      error: "Content-rights confirmation is required before processing.",
    };
  }

  if (!imageFile || typeof imageFile.arrayBuffer !== "function") {
    return {
      error: "Please upload a valid image.",
    };
  }

  if (!allowedTypes.includes(imageFile.type)) {
    return {
      error: "The uploaded image must be JPG, PNG or WEBP.",
    };
  }

  if (imageFile.size > MAX_FILE_SIZE) {
    return {
      error: "The uploaded image must be 20 MB or smaller.",
    };
  }

  if (!allowedChoices.includes(processingChoice)) {
    return {
      error: "Please select a valid processing option.",
    };
  }

  if (!allowedLanguages.includes(sourceLanguage)) {
    return {
      error: "Please select a valid source language.",
    };
  }

  if (
    processingChoice === "cleanup" &&
    (!maskFile ||
      typeof maskFile.arrayBuffer !== "function" ||
      maskFile.type !== "image/png")
  ) {
    return {
      error: "Paint over the watermark before processing.",
    };
  }

let creditReserved = false;

try {
  await reserveMediaCredit({
    shop: session.shop,
    processingType: processingChoice,
    requestId,
  });

  creditReserved = true;

  const result = await processPhoto({
    imageFile,
    maskFile,
    processingChoice,
    sourceLanguage,
  });

  await completeMediaCredit(requestId);

  const account = await getMediaCreditAccount(session.shop);

  return {
    completedImageUrl: `data:${result.mimeType};base64,${result.imageBase64}`,
    creditBalance: account.balance,
    processingChoice,
  };
} catch (error) {
  if (creditReserved) {
    try {
      await refundMediaCredit(requestId);
    } catch (refundError) {
      console.error("Photo credit refund failed:", refundError);
    }
  }

  console.error("Photo processing failed:", error);

  if (error instanceof InsufficientMediaCreditsError) {
    return {
      error:
        "No photo credits are available. Please purchase or add credits before processing.",
    };
  }

  return {
    error:
      "The photo could not be processed. Please try again. If the problem continues, contact support.",
  };
}
}

export default function PhotoCleanup() {
  const imageRef = useRef(null);
  const paintCanvasRef = useRef(null);
  const currentStrokeRef = useRef(null);
  const { creditBalance } = useLoaderData();
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [processingChoice, setProcessingChoice] = useState("cleanup");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [brushSize, setBrushSize] = useState(4);
  const [brushTool, setBrushTool] = useState("paint");
  const [paintStrokes, setPaintStrokes] = useState([]);
  const [isPainting, setIsPainting] = useState(false);
const fetcher = useFetcher();
const isProcessing = fetcher.state !== "idle";
const [completedImageUrl, setCompletedImageUrl] = useState("");
const [processingError, setProcessingError] = useState("");
const displayedCreditBalance =
  fetcher.data?.creditBalance ?? creditBalance;

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

useEffect(() => {
  let cancelled = false;

  async function prepareCompletedImage() {
    if (!fetcher.data?.completedImageUrl) return;

    try {
      const finalImageUrl =
        fetcher.data.processingChoice === "cleanup"
          ? await protectUnpaintedPixels(
              fetcher.data.completedImageUrl,
            )
          : fetcher.data.completedImageUrl;

      if (!cancelled) {
        setCompletedImageUrl(finalImageUrl);
        setProcessingError("");
      }
    } catch (imageError) {
      console.error("Completed photo protection failed:", imageError);
      if (!cancelled) {
        setProcessingError(
          "The repaired photo could not be safely combined with the original.",
        );
        setCompletedImageUrl("");
      }
    }
  }

  if (fetcher.data?.completedImageUrl) {
    prepareCompletedImage();
  } else if (fetcher.data?.error) {
    setProcessingError(fetcher.data.error);
    setCompletedImageUrl("");
  }

  return () => {
    cancelled = true;
  };
}, [fetcher.data]);

  function handleFileChange(event) {
    const file = event.target.files?.[0];

    setError("");
setCompletedImageUrl("");
setProcessingError("");
setAnalysisStarted(false);
setRightsConfirmed(false);
    setPaintStrokes([]);
    setBrushTool("paint");

    if (!file) {
      setSelectedFile(null);
      setPreviewUrl("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("The image must be 20 MB or smaller.");
      event.target.value = "";
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function clearImage() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(null);
    setPreviewUrl("");
    setError("");
    setRightsConfirmed(false);
setAnalysisStarted(false);
setCompletedImageUrl("");
setProcessingError("");
    setPaintStrokes([]);
    setBrushTool("paint");
  }

  function preparePaintCanvas() {
    const image = imageRef.current;
    const canvas = paintCanvasRef.current;
    if (!image || !canvas) return;

    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    redrawPaint([]);
  }

  function getCanvasPoint(event) {
    const canvas = paintCanvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    return {
      x:
        ((event.clientX - bounds.left) / bounds.width) *
        canvas.width,
      y:
        ((event.clientY - bounds.top) / bounds.height) *
        canvas.height,
    };
  }

  function drawStroke(context, stroke) {
    if (!context || stroke.points.length === 0) return;
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = stroke.size;
    context.globalCompositeOperation =
      stroke.tool === "erase" ? "destination-out" : "source-over";
    context.strokeStyle = "rgba(255, 0, 0, 0.58)";
    context.fillStyle = "rgba(255, 0, 0, 0.58)";
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (const point of stroke.points.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    context.stroke();
    if (stroke.points.length === 1) {
      context.beginPath();
      context.arc(
        stroke.points[0].x,
        stroke.points[0].y,
        stroke.size / 2,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    context.restore();
  }

  function redrawPaint(strokes) {
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    strokes.forEach((stroke) => drawStroke(context, stroke));
  }

  function beginPaint(event) {
    const canvas = paintCanvasRef.current;
    const point = getCanvasPoint(event);
    if (!canvas || !point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke = {
      tool: brushTool,
      size: Math.max((brushSize / 100) * canvas.width, 2),
      points: [point],
    };
    currentStrokeRef.current = stroke;
    setIsPainting(true);
    drawStroke(canvas.getContext("2d"), stroke);
  }

  function continuePaint(event) {
    const stroke = currentStrokeRef.current;
    const canvas = paintCanvasRef.current;
    const point = getCanvasPoint(event);
    if (!stroke || !canvas || !point) return;
    stroke.points.push(point);
    redrawPaint([...paintStrokes, stroke]);
  }

  function finishPaint() {
    const stroke = currentStrokeRef.current;
    if (!stroke) return;
    const nextStrokes = [...paintStrokes, stroke];
    currentStrokeRef.current = null;
    setIsPainting(false);
    setPaintStrokes(nextStrokes);
    redrawPaint(nextStrokes);
  }

  function undoPaint() {
    const nextStrokes = paintStrokes.slice(0, -1);
    setPaintStrokes(nextStrokes);
    redrawPaint(nextStrokes);
  }

  function clearPaint() {
    setPaintStrokes([]);
    redrawPaint([]);
  }

  function createSelectionCanvas() {
    const sourceCanvas = paintCanvasRef.current;
    if (!sourceCanvas) return null;
    const selectionCanvas = document.createElement("canvas");
    selectionCanvas.width = sourceCanvas.width;
    selectionCanvas.height = sourceCanvas.height;
    const context = selectionCanvas.getContext("2d");
    const sourcePixels = sourceCanvas
      .getContext("2d")
      .getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const selectionPixels = context.createImageData(
      selectionCanvas.width,
      selectionCanvas.height,
    );

    for (let index = 0; index < sourcePixels.data.length; index += 4) {
      selectionPixels.data[index] = 255;
      selectionPixels.data[index + 1] = 255;
      selectionPixels.data[index + 2] = 255;
      selectionPixels.data[index + 3] =
        sourcePixels.data[index + 3] > 0 ? 255 : 0;
    }

    context.putImageData(selectionPixels, 0, 0);
    return selectionCanvas;
  }

  function createMaskBlob() {
    const selectionCanvas = createSelectionCanvas();
    if (!selectionCanvas) return Promise.resolve(null);
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = selectionCanvas.width;
    maskCanvas.height = selectionCanvas.height;
    const context = maskCanvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    context.globalCompositeOperation = "destination-out";
    context.drawImage(selectionCanvas, 0, 0);
    return new Promise((resolve) => maskCanvas.toBlob(resolve, "image/png"));
  }

  function loadGeneratedImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Generated image could not load."));
      image.src = url;
    });
  }

  async function protectUnpaintedPixels(generatedImageUrl) {
    const originalImage = imageRef.current;
    const selectionCanvas = createSelectionCanvas();
    if (!originalImage || !selectionCanvas) {
      throw new Error("Original photo or painted mask is unavailable.");
    }

    const generatedImage = await loadGeneratedImage(generatedImageUrl);
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = originalImage.naturalWidth;
    outputCanvas.height = originalImage.naturalHeight;
    const outputContext = outputCanvas.getContext("2d");
    outputContext.drawImage(
      originalImage,
      0,
      0,
      outputCanvas.width,
      outputCanvas.height,
    );

    const repairedPixels = document.createElement("canvas");
    repairedPixels.width = outputCanvas.width;
    repairedPixels.height = outputCanvas.height;
    const repairedContext = repairedPixels.getContext("2d");
    repairedContext.drawImage(
      generatedImage,
      0,
      0,
      repairedPixels.width,
      repairedPixels.height,
    );
    repairedContext.globalCompositeOperation = "destination-in";
    repairedContext.drawImage(selectionCanvas, 0, 0);
    outputContext.drawImage(repairedPixels, 0, 0);

    return outputCanvas.toDataURL("image/png");
  }

async function startPhotoAnalysis() {
  if (!selectedFile || !rightsConfirmed || isProcessing) {
    return;
  }

  const formData = new FormData();

  formData.append("image", selectedFile);
  formData.append("rightsConfirmed", "true");
  formData.append("processingChoice", processingChoice);
  formData.append("sourceLanguage", sourceLanguage);
  formData.append("requestId", crypto.randomUUID());

  if (processingChoice === "cleanup") {
    if (paintStrokes.length === 0) {
      setProcessingError("Paint over the watermark before processing.");
      return;
    }
    const maskBlob = await createMaskBlob();
    if (!maskBlob) {
      setProcessingError("The painted removal mask could not be created.");
      return;
    }
    formData.append("mask", maskBlob, "painted-removal-mask.png");
  }

  fetcher.submit(formData, {
    method: "post",
    encType: "multipart/form-data",
  });
}

   return (
    <s-page heading="Photo Translator & Cleanup">
      <section className={styles.mediaCard}>
        <s-button href="/app/media-tools" variant="primary">
          ← Back to Media Tools
        </s-button>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Upload Photo</s-heading>

        <s-paragraph>
          Upload a product photo to translate visible text, remove authorised
          watermarks or overlays, and preview the completed image.
        </s-paragraph>

        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
        />

        <s-paragraph>
          Accepted formats: JPG, PNG and WEBP. Maximum file size: 20 MB.
        </s-paragraph>

        {error && <s-banner tone="critical">{error}</s-banner>}
      </section>

      {selectedFile && (
        <section className={styles.mediaCard}>
          <s-heading>Original Photo</s-heading>

          <s-paragraph>File: {selectedFile.name}</s-paragraph>

          <s-paragraph>
            Choose a brush size and paint red only over the watermark or
            writing that must be removed. You can repaint, erase, undo or
            clear the mask before using a credit.
          </s-paragraph>

          <div
            style={{
              position: "relative",
              display: "inline-block",
              maxWidth: "100%",
              lineHeight: 0,
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <img
              ref={imageRef}
              src={previewUrl}
              alt="Uploaded product preview"
              onLoad={preparePaintCanvas}
              style={{
                display: "block",
                maxWidth: "100%",
                maxHeight: "600px",
              }}
            />
            <canvas
              ref={paintCanvasRef}
              aria-label="Paint over the area to remove"
              onPointerDown={beginPaint}
              onPointerMove={continuePaint}
              onPointerUp={finishPaint}
              onPointerCancel={finishPaint}
              onPointerLeave={() => {
                if (isPainting) finishPaint();
              }}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                cursor: "crosshair",
                touchAction: "none",
              }}
            />
          </div>

          <div style={{ marginTop: "12px" }}>
            <label>
              Brush size{" "}
              <select
                value={brushSize}
                onChange={(event) =>
                  setBrushSize(Number(event.target.value))
                }
              >
                <option value="2">Small</option>
                <option value="4">Medium</option>
                <option value="7">Large</option>
                <option value="10">Extra Large</option>
              </select>
            </label>{" "}
            <s-button
              variant={brushTool === "paint" ? "primary" : undefined}
              onClick={() => setBrushTool("paint")}
            >
              Paint
            </s-button>{" "}
            <s-button
              variant={brushTool === "erase" ? "primary" : undefined}
              disabled={paintStrokes.length === 0}
              onClick={() => setBrushTool("erase")}
            >
              Eraser
            </s-button>{" "}
            <s-button
              disabled={paintStrokes.length === 0}
              onClick={undoPaint}
            >
              Undo Last Stroke
            </s-button>{" "}
            <s-button
              disabled={paintStrokes.length === 0}
              onClick={clearPaint}
            >
              Clear All Paint
            </s-button>
          </div>

          <s-button onClick={clearImage}>Remove Photo</s-button>
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
          I confirm that I own this media or have permission to translate,
          modify and remove its watermarks or overlays for promotional
          purposes in my store or stores only.
        </label>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Processing Options</s-heading>

        <s-unordered-list>
          <s-list-item>Detect visible text in the photo</s-list-item>
          <s-list-item>
            Translate detected text into English
          </s-list-item>
          <s-list-item>
            Remove authorised watermarks or overlays
          </s-list-item>
          <s-list-item>
            Preview the completed photo before download
          </s-list-item>
        </s-unordered-list>

        <s-button
          variant="primary"
          disabled={!selectedFile || !rightsConfirmed}
          onClick={() => setAnalysisStarted(true)}
        >
          Analyse Photo
        </s-button>
      </section>

      {analysisStarted && selectedFile && (
        <section className={styles.mediaCard}>
          <s-heading>Photo Analysis Setup</s-heading>

          <s-banner tone="success">
            Photo accepted. Choose the work required before processing
            begins.
          </s-banner>

          <s-banner tone="warning">
            Processing can take up to 1–2 minutes. Please keep this page
            open and click Start Photo Analysis only once.
          </s-banner>

          <s-paragraph>
            For best results when both services are required, complete
            Watermark Removal first. Then upload the cleaned photo again
            and use the Translate Visible Text option.
          </s-paragraph>

          <s-banner>
            Each successfully completed processing run uses 1 photo
            credit. Watermark removal and translation are separate
            processes and use 1 credit each. Failed processing attempts
            do not use a credit.
          </s-banner>

          <s-paragraph>
            Available photo credits: {displayedCreditBalance}
          </s-paragraph>

          <s-paragraph>
            Uploaded and completed photos are not saved in the GEANOS
            Store IQ database. Download the completed photo before
            leaving or refreshing this page.
          </s-paragraph>

          <s-paragraph>
            Selected photo: {selectedFile.name}
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
                name="processingChoice"
                value="translate"
                checked={processingChoice === "translate"}
                onChange={(event) =>
                  setProcessingChoice(event.target.value)
                }
              />{" "}
              Detect and translate visible text into English
            </label>

            <br />

            <label>
              <input
                type="radio"
                name="processingChoice"
                value="cleanup"
                checked={processingChoice === "cleanup"}
                onChange={(event) =>
                  setProcessingChoice(event.target.value)
                }
              />{" "}
              Remove authorised watermarks or overlays
            </label>
          </fieldset>

          {displayedCreditBalance < 1 && (
            <s-banner tone="warning">
              No photo credits are currently available. Add or purchase
              credits before starting photo processing.
            </s-banner>
          )}

          <s-button
            variant="primary"
            disabled={
              isProcessing ||
              displayedCreditBalance < 1 ||
              (processingChoice === "cleanup" && paintStrokes.length === 0)
            }
            onClick={startPhotoAnalysis}
          >
            {isProcessing
              ? "Processing Photo..."
              : processingChoice === "cleanup"
                ? "Remove Painted Area"
                : "Translate Visible Text"}
          </s-button>
        </section>
      )}

      {processingError && (
        <section className={styles.mediaCard}>
          <s-heading>Photo Processing Error</s-heading>

          <s-banner tone="critical">{processingError}</s-banner>
        </section>
      )}

      {completedImageUrl && (
        <section className={styles.mediaCard}>
          <s-heading>Completed Photo</s-heading>

          <s-banner tone="success">
            Photo processing completed successfully. Review the result
            before downloading it.
          </s-banner>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "20px",
              marginTop: "16px",
            }}
          >
            <div>
              <h3>Before</h3>

              <img
                src={previewUrl}
                alt="Original uploaded product"
                style={{
                  display: "block",
                  width: "100%",
                  maxHeight: "600px",
                  objectFit: "contain",
                  borderRadius: "8px",
                }}
              />
            </div>

            <div>
              <h3>After</h3>

              <img
                src={completedImageUrl}
                alt="Completed translated or cleaned product"
                style={{
                  display: "block",
                  width: "100%",
                  maxHeight: "600px",
                  objectFit: "contain",
                  borderRadius: "8px",
                }}
              />
            </div>
          </div>

          <p>
            <a
              href={completedImageUrl}
              download="GEANOS-completed-photo.png"
            >
              Download Completed Photo
            </a>
          </p>

          <s-button onClick={clearImage}>
            Process Another Photo
          </s-button>
        </section>
      )}
    </s-page>
  );
}
