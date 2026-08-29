import { useEffect, useState } from "react";
import styles from "../styles/media-tools.module.css";

const MAX_VIDEO_SIZE = 200 * 1024 * 1024;

const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

export default function VideoCleanup() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [processingChoice, setProcessingChoice] =
    useState("translate");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [error, setError] = useState("");
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [inputKey, setInputKey] = useState(0);

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
    setError("");
    setAnalysisStarted(false);
    setInputKey((currentKey) => currentKey + 1);
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

          <s-banner>
            The video has passed the upload and setup checks. Actual
            video processing will be connected in the next build.
          </s-banner>

          <s-button disabled>
            Start Video Processing — Next Build
          </s-button>
        </section>
      )}
    </s-page>
  );
}