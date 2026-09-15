import { useEffect, useState } from "react";
import styles from "../styles/media-tools.module.css";

const MAX_VIDEO_SIZE = 200 * 1024 * 1024;
const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

export default function VideoTranslate() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return undefined;
    }

    const videoUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(videoUrl);

    return () => URL.revokeObjectURL(videoUrl);
  }, [selectedFile]);

  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;
    setError("");

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
      setSelectedFile(null);
      setError("Please select an MP4, WEBM or MOV video file.");
      return;
    }

    if (file.size > MAX_VIDEO_SIZE) {
      setSelectedFile(null);
      setError("The selected video is larger than the 200 MB limit.");
      return;
    }

    setSelectedFile(file);
  }

  return (
    <s-page heading="Video Text Translation">
      <section className={styles.mediaCard}>
        <s-button href="/app/video-tools" variant="primary">
          ← Back to Video Tools
        </s-button>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Translate Visible Video Text</s-heading>

        <s-paragraph>
          This dedicated workspace will detect visible foreign-language text,
          translate it into clear English and place the English wording into
          the finished product video.
        </s-paragraph>

        <s-banner tone="info">
          Translation is separate from Video Text Removal. Changes made here
          will not alter the working removal processor.
        </s-banner>
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Upload Video</s-heading>

        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={handleFileChange}
        />

        <s-paragraph>
          Accepted formats: MP4, WEBM and MOV. Maximum file size: 200 MB.
        </s-paragraph>

        {error && <s-banner tone="critical">{error}</s-banner>}

        {selectedFile && (
          <>
            <s-paragraph>File: {selectedFile.name}</s-paragraph>

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
          </>
        )}
      </section>

      <section className={styles.mediaCard}>
        <s-heading>Translation Settings</s-heading>

        <label>
          Original language{" "}
          <select
            value={sourceLanguage}
            onChange={(event) => setSourceLanguage(event.target.value)}
          >
            <option value="auto">Detect automatically</option>
            <option value="chinese">Chinese</option>
            <option value="japanese">Japanese</option>
            <option value="korean">Korean</option>
            <option value="other">Other language</option>
          </select>
        </label>

        <s-paragraph>
          English will be the output language. The translation processor will
          be connected and tested on this page in the next controlled stage.
        </s-paragraph>

        <label>
          <input
            type="checkbox"
            checked={rightsConfirmed}
            onChange={(event) => setRightsConfirmed(event.target.checked)}
          />{" "}
          I confirm that I own this video or have permission to translate and
          edit it.
        </label>

        <s-button
          variant="primary"
          disabled
        >
          Translation Processor Setup Next
        </s-button>
      </section>
    </s-page>
  );
}
