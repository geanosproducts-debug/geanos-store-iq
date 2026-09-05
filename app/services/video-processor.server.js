import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { fal } from "@fal-ai/client";
import os from "node:os";
import path from "node:path";
import vision from "@google-cloud/vision";
import OpenAI from "openai";
import Replicate from "replicate";

const SAMPLE_INTERVAL_SECONDS = 2;
const MAX_ANALYSIS_FRAMES = 45;
const OPENAI_FRAME_BATCH_SIZE = 8;
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_VOID_SEGMENT_FRAMES = 197;
const MIN_VOID_SEGMENT_FRAMES = 69;
const VOID_PROCESSING_FRAME_RATE = 12;
const VOID_INFERENCE_STEPS = 8;

const PROPAINTER_MODEL =
  "jd7h/propainter:e5ea7ae04e97c96a0e14c70d8e4cb899abdf326a377c01f1c10966ccd6c6bae4";

const VOID_MODEL =
  "fal-ai/void-video-inpainting";

const PROPAINTER_BUCKET =
  "geanos-store-iq-media-processing";
const ALLOWED_LANGUAGES = {
  auto: "Detect the original language automatically.",
  chinese: "The original language is Chinese.",
  japanese: "The original language is Japanese.",
  korean: "The original language is Korean.",
  other: "Detect the original language.",
};

export class NoTranslatableVideoTextError extends Error {
  constructor() {
    super(
      "No visible foreign text requiring English translation was detected.",
    );
    this.name = "NoTranslatableVideoTextError";
  }
}

function getFfmpegCommand() {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

function getFfprobeCommand() {
  if (process.env.FFPROBE_PATH) {
    return process.env.FFPROBE_PATH;
  }

  if (process.env.FFMPEG_PATH) {
    const executableName =
      process.platform === "win32" ? "ffprobe.exe" : "ffprobe";

    return path.join(
      path.dirname(process.env.FFMPEG_PATH),
      executableName,
    );
  }

  return "ffprobe";
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      windowsHide: true,
    });

    let standardOutput = "";
    let errorOutput = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      childProcess.kill();
    }, COMMAND_TIMEOUT_MS);

    childProcess.stdout.on("data", (chunk) => {
      standardOutput += chunk.toString();
    });

    childProcess.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
    });

    childProcess.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    childProcess.on("close", (exitCode) => {
      clearTimeout(timeout);

      if (timedOut) {
        reject(
          new Error(
            "Video processing took too long and was stopped.",
          ),
        );
        return;
      }

      if (exitCode !== 0) {
        reject(
          new Error(
            `Video processing failed: ${errorOutput.slice(-2000)}`,
          ),
        );
        return;
      }

      resolve({
        standardOutput,
        errorOutput,
      });
    });
  });
}

async function getVideoInformation(videoPath) {
  const { standardOutput } = await runCommand(
    getFfprobeCommand(),
    [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      videoPath,
    ],
  );

  const videoInformation = JSON.parse(standardOutput);
  const duration = Number(videoInformation.format?.duration);
  const videoStream = videoInformation.streams?.find(
    (stream) => stream.codec_type === "video",
  );

  const height = Number(videoStream?.height);
const width = Number(videoStream?.width);
  const frameRateValue =
    videoStream?.avg_frame_rate ||
    videoStream?.r_frame_rate ||
    "";

  const [frameRateNumerator, frameRateDenominator] =
    String(frameRateValue)
      .split("/")
      .map(Number);

  const frameRate =
    Number.isFinite(frameRateNumerator) &&
    Number.isFinite(frameRateDenominator) &&
    frameRateDenominator > 0
      ? frameRateNumerator / frameRateDenominator
      : Number(frameRateValue);

  const reportedFrameCount = Number(
    videoStream?.nb_frames,
  );

  const frameCount =
    Number.isFinite(reportedFrameCount) &&
    reportedFrameCount > 0
      ? Math.round(reportedFrameCount)
      : Math.ceil(duration * frameRate);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(
      "The duration of the uploaded video could not be determined.",
    );
  }

  if (
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(height) ||
    height <= 0
  ) {
    throw new Error(
      "The dimensions of the uploaded video could not be determined.",
    );
  }

    if (
    !Number.isFinite(frameRate) ||
    frameRate <= 0 ||
    !Number.isFinite(frameCount) ||
    frameCount <= 0
  ) {
    throw new Error(
      "The frame rate or frame count of the uploaded video could not be determined.",
    );
  }

  return {
    duration,
    width,
    height,
    frameRate,
    frameCount,
  };
}

function createVoidSegmentPlan({
  frameCount,
  outputFrameCount = frameCount,
}) {
  const segments = [];
  let outputStartFrame = 0;

  while (outputStartFrame < outputFrameCount) {
    const remainingFrames =
      outputFrameCount - outputStartFrame;

    if (
      remainingFrames >
      MAX_VOID_SEGMENT_FRAMES
    ) {
      segments.push({
        segmentIndex: segments.length,
        startFrame: outputStartFrame,
        endFrameExclusive:
          outputStartFrame +
          MAX_VOID_SEGMENT_FRAMES,
        numFrames:
          MAX_VOID_SEGMENT_FRAMES,
        discardLeadingFrames: 0,
        outputFrameCount:
          MAX_VOID_SEGMENT_FRAMES,
      });

      outputStartFrame +=
        MAX_VOID_SEGMENT_FRAMES;

      continue;
    }

    const supportedFrameCount =
      remainingFrames <= MIN_VOID_SEGMENT_FRAMES
        ? MIN_VOID_SEGMENT_FRAMES
        : Math.min(
            MAX_VOID_SEGMENT_FRAMES,
            MIN_VOID_SEGMENT_FRAMES +
              Math.ceil(
                (remainingFrames -
                  MIN_VOID_SEGMENT_FRAMES) /
                  8,
              ) *
                8,
          );

    const inputEndFrame = Math.min(
      frameCount,
      Math.max(
        outputFrameCount,
        supportedFrameCount,
      ),
    );

    const inputStartFrame = Math.max(
      inputEndFrame - supportedFrameCount,
      0,
    );

    const actualInputFrameCount =
      inputEndFrame - inputStartFrame;

    if (
      actualInputFrameCount <
      MIN_VOID_SEGMENT_FRAMES
    ) {
      throw new Error(
        "VOID requires at least 69 video frames for cleanup.",
      );
    }

    segments.push({
      segmentIndex: segments.length,
      startFrame: inputStartFrame,
      endFrameExclusive: inputEndFrame,
      numFrames: actualInputFrameCount,
      discardLeadingFrames:
        outputStartFrame - inputStartFrame,
      outputFrameCount: remainingFrames,
    });

    outputStartFrame = outputFrameCount;
  }

  return segments;
}

async function prepareVoidInputFiles({
  videoPath,
  maskPath,
  preparedVideoPath,
  preparedMaskPath,
  duration,
}) {
  const outputFrameCount = Math.max(
    Math.ceil(
      duration * VOID_PROCESSING_FRAME_RATE,
    ),
    1,
  );

  const preparedFrameCount = Math.max(
    outputFrameCount,
    MIN_VOID_SEGMENT_FRAMES,
  );

  const paddingFrames =
    preparedFrameCount - outputFrameCount;

  const paddingDuration =
    paddingFrames /
    VOID_PROCESSING_FRAME_RATE;

  const paddingFilter =
    paddingFrames > 0
      ? `,tpad=stop_mode=clone:stop_duration=${paddingDuration.toFixed(
          6,
        )}`
      : "";

  const videoFilter =
    `fps=${VOID_PROCESSING_FRAME_RATE}` +
    paddingFilter;

  await Promise.all([
    runCommand(getFfmpegCommand(), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      videoPath,
      "-map",
      "0:v:0",
      "-vf",
      videoFilter,
      "-frames:v",
      String(preparedFrameCount),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-y",
      preparedVideoPath,
    ]),
    runCommand(getFfmpegCommand(), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      maskPath,
      "-map",
      "0:v:0",
      "-vf",
      videoFilter,
      "-frames:v",
      String(preparedFrameCount),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "0",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-y",
      preparedMaskPath,
    ]),
  ]);

  return {
    preparedFrameCount,
    outputFrameCount,
  };
}

async function extractVoidSegmentFiles({
  videoPath,
  maskPath,
  videoSegmentPath,
  maskSegmentPath,
  startFrame,
  endFrameExclusive,
}) {
  const trimFilter =
    `trim=start_frame=${startFrame}:` +
    `end_frame=${endFrameExclusive},` +
    "setpts=PTS-STARTPTS";

  await Promise.all([
    runCommand(getFfmpegCommand(), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      videoPath,
      "-map",
      "0:v:0",
      "-vf",
      trimFilter,
      "-an",
      "-fps_mode",
      "passthrough",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-y",
      videoSegmentPath,
    ]),
    runCommand(getFfmpegCommand(), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      maskPath,
      "-map",
      "0:v:0",
      "-vf",
      trimFilter,
      "-an",
      "-fps_mode",
      "passthrough",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "0",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-y",
      maskSegmentPath,
    ]),
  ]);
}
async function trimVoidOutputSegment({
  inputPath,
  outputPath,
  discardLeadingFrames,
  outputFrameCount,
  outputFrameRate,
}) {
  const endFrameExclusive =
    discardLeadingFrames +
    outputFrameCount;

  const trimFilter =
    `trim=start_frame=${discardLeadingFrames}:` +
    `end_frame=${endFrameExclusive},` +
    `setpts=N/(${VOID_PROCESSING_FRAME_RATE}*TB),` +
    `fps=${outputFrameRate}`;

  await runCommand(getFfmpegCommand(), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-vf",
    trimFilter,
    "-an",
    "-fps_mode",
    "cfr",
    "-r",
    String(outputFrameRate),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-y",
    outputPath,
  ]);
}
async function reassembleVoidSegments({
  segmentPaths,
  concatListPath,
  outputPath,
}) {
  if (
    !Array.isArray(segmentPaths) ||
    segmentPaths.length === 0
  ) {
    throw new Error(
      "No cleaned VOID segments were available for reassembly.",
    );
  }

  const concatList = segmentPaths
    .map((segmentPath) => {
      const safePath = segmentPath
        .replace(/\\/g, "/")
        .replace(/'/g, "\\'");

      return `file '${safePath}'`;
    })
    .join("\n");

  await fs.writeFile(
    concatListPath,
    `${concatList}\n`,
    "utf8",
  );

  await runCommand(getFfmpegCommand(), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-map",
    "0:v:0",
    "-an",
    "-c:v",
    "copy",
    "-movflags",
    "+faststart",
    "-y",
    outputPath,
  ]);
}

async function runVoidCleanup({
  videoPath,
  maskPath,
  segmentDirectory,
  concatListPath,
  outputPath,
  frameCount,
  frameRate,
  duration,
}) {
  const preparedVideoPath = path.join(
    segmentDirectory,
    "void-source-12fps.mp4",
  );

  const preparedMaskPath = path.join(
    segmentDirectory,
    "void-mask-12fps.mp4",
  );

  const {
    preparedFrameCount,
    outputFrameCount,
  } = await prepareVoidInputFiles({
    videoPath,
    maskPath,
    preparedVideoPath,
    preparedMaskPath,
    duration,
  });

  const segmentPlan = createVoidSegmentPlan({
    frameCount: preparedFrameCount,
    outputFrameCount,
  });

  const cleanedSegmentPaths = [];

  for (const segment of segmentPlan) {
    const segmentNumber = String(
      segment.segmentIndex + 1,
    ).padStart(3, "0");

    const videoSegmentPath = path.join(
      segmentDirectory,
      `video-${segmentNumber}.mp4`,
    );

    const maskSegmentPath = path.join(
      segmentDirectory,
      `mask-${segmentNumber}.mp4`,
    );

    const rawCleanedSegmentPath = path.join(
      segmentDirectory,
      `raw-cleaned-${segmentNumber}.mp4`,
    );

    const cleanedSegmentPath = path.join(
      segmentDirectory,
      `cleaned-${segmentNumber}.mp4`,
    );

    await extractVoidSegmentFiles({
      videoPath: preparedVideoPath,
      maskPath: preparedMaskPath,
      videoSegmentPath,
      maskSegmentPath,
      startFrame: segment.startFrame,
      endFrameExclusive:
        segment.endFrameExclusive,
    });

    await runVoidSegment({
      videoSegmentPath,
      maskSegmentPath,
      outputSegmentPath:
        rawCleanedSegmentPath,
      numFrames: segment.numFrames,
    });

    await trimVoidOutputSegment({
      inputPath: rawCleanedSegmentPath,
      outputPath: cleanedSegmentPath,
      discardLeadingFrames:
        segment.discardLeadingFrames,
      outputFrameCount:
        segment.outputFrameCount,
      outputFrameRate: frameRate,
    });

    cleanedSegmentPaths.push(
      cleanedSegmentPath,
    );
  }

  await reassembleVoidSegments({
    segmentPaths: cleanedSegmentPaths,
    concatListPath,
    outputPath,
  });
}

async function extractAnalysisFrames({
  videoPath,
  frameDirectory,
}) {
  const outputPattern = path.join(
    frameDirectory,
    "frame-%04d.jpg",
  );

  await runCommand(getFfmpegCommand(), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoPath,
    "-vf",
    `fps=1/${SAMPLE_INTERVAL_SECONDS},scale=960:-2:force_original_aspect_ratio=decrease`,
    "-frames:v",
    String(MAX_ANALYSIS_FRAMES),
    "-q:v",
    "4",
    outputPattern,
  ]);

  const frameNames = (await fs.readdir(frameDirectory))
    .filter((fileName) => fileName.endsWith(".jpg"))
    .sort();

  return frameNames.map((fileName, index) => ({
    filePath: path.join(frameDirectory, fileName),
    timestamp: index * SAMPLE_INTERVAL_SECONDS,
  }));
}

function parseOpenAIJson(responseText) {
  const cleanedResponse = responseText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  return JSON.parse(cleanedResponse);
}

function clampPercentage(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.min(Math.max(numericValue, 0), 100);
}
const FOREIGN_CHARACTER_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Thai}\p{Script=Devanagari}]/u;

function createPercentageBox({
  vertices,
  imageWidth,
  imageHeight,
}) {
  if (!vertices || vertices.length === 0) {
    return null;
  }

  const xValues = vertices.map((vertex) =>
    Number(vertex.x ?? 0),
  );
  const yValues = vertices.map((vertex) =>
    Number(vertex.y ?? 0),
  );

  const minimumX = Math.min(...xValues);
  const minimumY = Math.min(...yValues);
  const maximumX = Math.max(...xValues);
  const maximumY = Math.max(...yValues);

  return {
    x: clampPercentage(
      (minimumX / imageWidth) * 100,
    ),
    y: clampPercentage(
      (minimumY / imageHeight) * 100,
    ),
    width: clampPercentage(
      ((maximumX - minimumX) / imageWidth) * 100,
    ),
    height: clampPercentage(
      ((maximumY - minimumY) / imageHeight) * 100,
    ),
  };
}

function createVisionTextDetection(visionResult) {
  const page =
    visionResult.fullTextAnnotation?.pages?.[0];
  const imageWidth = Number(page?.width);
  const imageHeight = Number(page?.height);

  if (
    !Number.isFinite(imageWidth) ||
    imageWidth <= 0 ||
    !Number.isFinite(imageHeight) ||
    imageHeight <= 0
  ) {
    return null;
  }

  const foreignSymbols = (page.blocks || [])
    .flatMap((block) => block.paragraphs || [])
    .flatMap((paragraph) => paragraph.words || [])
    .flatMap((word) => word.symbols || [])
    .filter((symbol) =>
      FOREIGN_CHARACTER_PATTERN.test(
        symbol.text || "",
      ),
    );

  let foreignRegions = foreignSymbols.map(
    (symbol) => ({
      text: symbol.text,
      vertices:
        symbol.boundingBox?.vertices || [],
    }),
  );

  if (foreignRegions.length === 0) {
    foreignRegions = (
      visionResult.textAnnotations || []
    )
      .slice(1)
      .filter((annotation) =>
        FOREIGN_CHARACTER_PATTERN.test(
          annotation.description || "",
        ),
      )
      .map((annotation) => ({
        text: annotation.description,
        vertices:
          annotation.boundingPoly?.vertices || [],
      }));
  }

  if (foreignRegions.length === 0) {
    return null;
  }

  const removalBoxes = foreignRegions
    .map((region) =>
      createPercentageBox({
        vertices: region.vertices,
        imageWidth,
        imageHeight,
      }),
    )
    .filter(
      (box) =>
        box &&
        box.width >= 0.2 &&
        box.height >= 0.2,
    );

  if (removalBoxes.length === 0) {
    return null;
  }

  const completeBox = createPercentageBox({
    vertices: foreignRegions.flatMap(
      (region) => region.vertices,
    ),
    imageWidth,
    imageHeight,
  });

  return {
    box: completeBox,
    removalBoxes,
  };
}

async function detectForeignText({
  visionClient,
  frame,
}) {
  const [visionResult] =
    await visionClient.textDetection(frame.filePath);

  return createVisionTextDetection(visionResult);
}

async function analyseFrameBatch({
  client,
  frames,
  sourceLanguage,
}) {
  const languageInstruction =
    ALLOWED_LANGUAGES[sourceLanguage] ||
    ALLOWED_LANGUAGES.auto;

  const imageContent = await Promise.all(
    frames.map(async (frame) => {
      const imageBase64 = await fs.readFile(
        frame.filePath,
        "base64",
      );

      return {
        type: "input_image",
        image_url: `data:image/jpeg;base64,${imageBase64}`,
        detail: "low",
      };
    }),
  );

  const timestampList = frames
    .map(
      (frame, index) =>
        `Image ${index + 1}: ${frame.timestamp.toFixed(1)} seconds`,
    )
    .join("\n");

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
You are analysing authorised product-video frames.

${languageInstruction}

For each supplied image:
1. Detect only meaningful visible non-English text intended for viewers.
2. Ignore product model numbers, measurements and decorative symbols unless
   they form part of an understandable message.
3. Translate the detected message into accurate, natural and concise English.
4. If no translation is required, return an empty englishText value.
5. Do not invent text that is not clearly visible.
6. Keep wording brief enough to use as a video subtitle.
7. When text is detected, return the tightest possible bounding rectangle
   around only the visible foreign-language characters. Do not include
   surrounding background, products, hands or decorative elements.
8. Return the rectangle as percentages of the complete image:
   - x is the distance from the left edge to the character rectangle.
   - y is the distance from the top edge to the character rectangle.
   - width is only the width occupied by the foreign characters.
   - height is only the height occupied by the foreign characters.
9. Use values from 0 to 100. Return zero for all four rectangle values when
   no translation is required.
10. Set englishAlreadyVisible to true when the same message is already clearly
   shown in readable English elsewhere in the image. Still return englishText
   as the accurate English translation so the foreign text can be removed,
   but the existing English wording will not be drawn a second time.

The images and timestamps are:

${timestampList}

Return JSON only in this exact structure:

{
  "frames": [
    {
      "image": 1,
      "englishText": "",
      "englishAlreadyVisible": false,
      "x": 0,
      "y": 0,
      "width": 0,
      "height": 0
    }
  ]
}

Return one entry for every supplied image in the same order.
`,
          },
          ...imageContent,
        ],
      },
    ],
  });

  const parsedResponse = parseOpenAIJson(
    response.output_text || "",
  );

  if (!Array.isArray(parsedResponse.frames)) {
    throw new Error(
      "OpenAI returned an invalid video-frame analysis.",
    );
  }

  return frames.map((frame, index) => {
    const result = parsedResponse.frames.find(
      (entry) => Number(entry.image) === index + 1,
    );

    return {
      timestamp: frame.timestamp,
      englishText:
        typeof result?.englishText === "string"
          ? result.englishText.trim()
          : "",
      englishAlreadyVisible:
        result?.englishAlreadyVisible === true,
      box: {
        x: clampPercentage(result?.x),
        y: clampPercentage(result?.y),
        width: clampPercentage(result?.width),
        height: clampPercentage(result?.height),
      },
    };
  });
}

async function analyseFrames({
  frames,
  sourceLanguage,
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "The OpenAI API key is not configured.",
    );
  }

  const openAIClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 60 * 1000,
  });

  const frameBatches = [];

  for (
    let batchStart = 0;
    batchStart < frames.length;
    batchStart += OPENAI_FRAME_BATCH_SIZE
  ) {
    frameBatches.push(
      frames.slice(
        batchStart,
        batchStart + OPENAI_FRAME_BATCH_SIZE,
      ),
    );
  }

  const batchResults = await Promise.all(
    frameBatches.map((frameBatch) =>
      analyseFrameBatch({
        client: openAIClient,
        frames: frameBatch,
        sourceLanguage,
      }),
    ),
  );

  return batchResults.flat().map((result) => ({
    ...result,
    removalBoxes: [],
  }));
}
async function createInpaintingMaskVideo({
  videoPath,
  analysisResults,
  maskPath,
  duration,
  videoWidth,
  videoHeight,
  invertForVoid = false,
}) {
  const preserveColor = invertForVoid
    ? "white"
    : "black";

  const removalColor = invertForVoid
    ? "black"
    : "white";

  const maskFilters = [
    "drawbox=x=0:y=0:w=iw:h=ih:" +
      `color=${preserveColor}:t=fill`,
  ];

  for (const result of analysisResults) {
    const suppliedRemovalBoxes =
      Array.isArray(result.removalBoxes)
        ? result.removalBoxes
        : [];

    const fallbackBox = result.box || {};

    const hasFallbackBox =
      fallbackBox.width >= 0.2 &&
      fallbackBox.height >= 0.2;

    const removalBoxes =
      suppliedRemovalBoxes.length > 0
        ? suppliedRemovalBoxes
        : hasFallbackBox
          ? [fallbackBox]
          : [];

    const start = Math.max(
      result.timestamp,
      0,
    );

    const end = Math.min(
      result.timestamp +
        SAMPLE_INTERVAL_SECONDS,
      duration,
    );

    for (const box of removalBoxes) {
      const paddingX = Math.max(
        box.width * 0.25,
        0.25,
      );

      const paddingY = Math.max(
        box.height * 0.4,
        0.3,
      );

      const xPercentage = Math.max(
        box.x - paddingX,
        0,
      );

      const yPercentage = Math.max(
        box.y - paddingY,
        0,
      );

      const widthPercentage = Math.min(
        box.width + paddingX * 2,
        100 - xPercentage,
      );

      const heightPercentage = Math.min(
        box.height + paddingY * 2,
        100 - yPercentage,
      );

      const x = Math.min(
        Math.max(
          Math.floor(
            videoWidth *
              (xPercentage / 100),
          ),
          0,
        ),
        Math.max(videoWidth - 2, 0),
      );

      const y = Math.min(
        Math.max(
          Math.floor(
            videoHeight *
              (yPercentage / 100),
          ),
          0,
        ),
        Math.max(videoHeight - 2, 0),
      );

      const width = Math.max(
        Math.min(
          Math.ceil(
            videoWidth *
              (widthPercentage / 100),
          ),
          videoWidth - x,
        ),
        2,
      );

      const height = Math.max(
        Math.min(
          Math.ceil(
            videoHeight *
              (heightPercentage / 100),
          ),
          videoHeight - y,
        ),
        2,
      );

      maskFilters.push(
        `drawbox=x=${x}:y=${y}` +
          `:w=${width}:h=${height}` +
          `:color=${removalColor}:t=fill` +
          `:enable='gte(t,${start.toFixed(
            3,
          )})*lt(t,${end.toFixed(3)})'`,
      );
    }
  }

  await runCommand(getFfmpegCommand(), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoPath,
    "-map",
    "0:v:0",
    "-vf",
    maskFilters.join(","),
    "-an",
    "-fps_mode",
    "passthrough",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "0",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-y",
    maskPath,
  ]);
}

async function runFastVideoCleanup({
  inputPath,
  analysisResults,
  outputPath,
  duration,
  videoWidth,
  videoHeight,
}) {
  const cleanupFilters = [];

  for (const result of analysisResults) {
    const suppliedRemovalBoxes =
      Array.isArray(result.removalBoxes)
        ? result.removalBoxes
        : [];

    const fallbackBox = result.box || {};

    const hasFallbackBox =
      fallbackBox.width >= 0.2 &&
      fallbackBox.height >= 0.2;

    const removalBoxes =
      suppliedRemovalBoxes.length > 0
        ? suppliedRemovalBoxes
        : hasFallbackBox
          ? [fallbackBox]
          : [];

    const start = Math.max(
      Number(result.timestamp) || 0,
      0,
    );

    const end = Math.min(
      start + SAMPLE_INTERVAL_SECONDS,
      duration,
    );

    for (const box of removalBoxes) {
      const paddingX = Math.max(
        box.width * 0.25,
        0.25,
      );

      const paddingY = Math.max(
        box.height * 0.4,
        0.3,
      );

      const xPercentage = Math.max(
        box.x - paddingX,
        0,
      );

      const yPercentage = Math.max(
        box.y - paddingY,
        0,
      );

      const widthPercentage = Math.min(
        box.width + paddingX * 2,
        100 - xPercentage,
      );

      const heightPercentage = Math.min(
        box.height + paddingY * 2,
        100 - yPercentage,
      );

      const x = Math.min(
        Math.max(
          Math.floor(
            videoWidth *
              (xPercentage / 100),
          ),
          1,
        ),
        Math.max(videoWidth - 4, 1),
      );

      const y = Math.min(
        Math.max(
          Math.floor(
            videoHeight *
              (yPercentage / 100),
          ),
          1,
        ),
        Math.max(videoHeight - 4, 1),
      );

      const width = Math.max(
        Math.min(
          Math.ceil(
            videoWidth *
              (widthPercentage / 100),
          ),
          videoWidth - x - 1,
        ),
        2,
      );

      const height = Math.max(
        Math.min(
          Math.ceil(
            videoHeight *
              (heightPercentage / 100),
          ),
          videoHeight - y - 1,
        ),
        2,
      );

      cleanupFilters.push(
        `delogo=x=${x}:y=${y}` +
          `:w=${width}:h=${height}` +
          ":show=0" +
          `:enable='gte(t,${start.toFixed(
            3,
          )})*lt(t,${end.toFixed(3)})'`,
      );
    }
  }

  const ffmpegArguments = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
  ];

  if (cleanupFilters.length > 0) {
    ffmpegArguments.push(
      "-vf",
      cleanupFilters.join(","),
    );
  }

  ffmpegArguments.push(
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-y",
    outputPath,
  );

  await runCommand(
    getFfmpegCommand(),
    ffmpegArguments,
  );
}

async function runProPainter({
  inputPath,
  maskPath,
  cleanedVideoPath,
}) {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error(
      "The Replicate API token is not configured.",
    );
  }

  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  const storage = new Storage({
    projectId:
      "geanos-store-iq-production",
  });

  const bucket = storage.bucket(
    PROPAINTER_BUCKET,
  );

  const processingId = randomUUID();

  const inputObjectName =
    `propainter/${processingId}/` +
    "input-video.mp4";

  const maskObjectName =
    `propainter/${processingId}/` +
    "mask-video.mp4";

  const inputObject = bucket.file(
    inputObjectName,
  );

  const maskObject = bucket.file(
    maskObjectName,
  );

  

  try {
    await Promise.all([
      bucket.upload(inputPath, {
        destination: inputObjectName,
        resumable: false,
        metadata: {
          contentType: "video/mp4",
        },
      }),
      bucket.upload(maskPath, {
        destination: maskObjectName,
        resumable: false,
        metadata: {
          contentType: "video/mp4",
        },
      }),
    ]);

    const signedUrlExpiry =
      Date.now() + 30 * 60 * 1000;

    const [
      [inputVideoUrl],
      [maskVideoUrl],
    ] = await Promise.all([
      inputObject.getSignedUrl({
        version: "v4",
        action: "read",
        expires: signedUrlExpiry,
      }),
      maskObject.getSignedUrl({
        version: "v4",
        action: "read",
        expires: signedUrlExpiry,
      }),
    ]);

    const output = await replicate.run(
      PROPAINTER_MODEL,
      {
        input: {
          video: inputVideoUrl,
          mask: maskVideoUrl,
          fp16: true,
          mask_dilation: 8,
          return_input_video: false,
        },
      },
    );

    const outputFile = Array.isArray(output)
      ? output[0]
      : output?.video || output;

    if (!outputFile) {
      throw new Error(
        "ProPainter did not return a cleaned video.",
      );
    }

    let completedVideoBytes;

    if (
      typeof outputFile.blob === "function"
    ) {
      const outputBlob =
        await outputFile.blob();

      completedVideoBytes =
        new Uint8Array(
          await outputBlob.arrayBuffer(),
        );
    } else {
      const outputResponse = await fetch(
        String(outputFile),
      );

      if (!outputResponse.ok) {
        throw new Error(
          "The cleaned ProPainter video could not be downloaded.",
        );
      }

      completedVideoBytes =
        new Uint8Array(
          await outputResponse.arrayBuffer(),
        );
    }

    await fs.writeFile(
      cleanedVideoPath,
      completedVideoBytes,
    );
  } finally {
    await Promise.allSettled([
      inputObject.delete(),
      maskObject.delete(),
    ]);
  }
}

async function runVoidSegment({
  videoSegmentPath,
  maskSegmentPath,
  outputSegmentPath,
  numFrames,
}) {
  if (!process.env.FAL_KEY) {
    throw new Error(
      "The fal.ai API key is not configured.",
    );
  }

  fal.config({
    credentials: process.env.FAL_KEY,
  });

  const storage = new Storage({
    projectId:
      "geanos-store-iq-production",
  });

  const bucket = storage.bucket(
    PROPAINTER_BUCKET,
  );

  const processingId = randomUUID();

  const videoObjectName =
    `void/${processingId}/` +
    "input-segment.mp4";

  const maskObjectName =
    `void/${processingId}/` +
    "mask-segment.mp4";

  const videoObject = bucket.file(
    videoObjectName,
  );

  const maskObject = bucket.file(
    maskObjectName,
  );

  const voidStartedAt = Date.now();
  let voidStageStartedAt = voidStartedAt;
  let lastVoidLogMessage = "";

  function logVoidStage(stageName) {
    const completedAt = Date.now();

    console.log(
      `[VOID TIMING] ${stageName}: ` +
        `${(
          (completedAt -
            voidStageStartedAt) /
          1000
        ).toFixed(2)}s` +
        ` | Total: ${(
          (completedAt - voidStartedAt) /
          1000
        ).toFixed(2)}s`,
    );

    voidStageStartedAt = completedAt;
  }

  try {
    await Promise.all([
      bucket.upload(videoSegmentPath, {
        destination: videoObjectName,
        resumable: false,
        metadata: {
          contentType: "video/mp4",
        },
      }),
      bucket.upload(maskSegmentPath, {
        destination: maskObjectName,
        resumable: false,
        metadata: {
          contentType: "video/mp4",
        },
      }),
    ]);
    logVoidStage(
      "Google Cloud video and mask upload",
    );

    const signedUrlExpiry =
      Date.now() + 60 * 60 * 1000;

    const [
      [videoUrl],
      [maskUrl],
    ] = await Promise.all([
      videoObject.getSignedUrl({
        version: "v4",
        action: "read",
        expires: signedUrlExpiry,
      }),
      maskObject.getSignedUrl({
        version: "v4",
        action: "read",
        expires: signedUrlExpiry,
      }),
    ]);

    logVoidStage(
      "Google Cloud signed URL creation",
    );

    const result = await fal.subscribe(
      VOID_MODEL,
      {
        input: {
          video_url: videoUrl,
          quad_mask_video_url: maskUrl,
          prompt:
            "Restore the original natural background " +
            "behind the removed overlaid text. Preserve " +
            "the products, people, motion, colours, " +
            "lighting, camera movement, and everything " +
            "outside the masked area. Do not add text " +
            "or watermarks.",
          num_frames: numFrames,
          num_inference_steps:
            VOID_INFERENCE_STEPS,
          enable_pass2_refinement: false,
          enable_safety_checker: false,
        },
        logs: true,
        onQueueUpdate(update) {
          if (
            update.status === "IN_PROGRESS"
          ) {
            const latestLog =
              update.logs?.at(-1)?.message;

            if (
              latestLog &&
              latestLog !== lastVoidLogMessage
            ) {
              console.log(
                `VOID: ${latestLog}`,
              );

              lastVoidLogMessage = latestLog;
            }
          }
        },
      },
    );

    logVoidStage(
      "fal.ai queue and VOID inference",
    );

    console.log(
      "[VOID PROVIDER TIMINGS]",
      result?.data?.timings || {},
    );

    const outputUrl =
      result?.data?.video?.url;

    if (!outputUrl) {
      throw new Error(
        "VOID did not return a cleaned video.",
      );
    }

    const outputResponse =
      await fetch(outputUrl);

    if (!outputResponse.ok) {
      throw new Error(
        "The cleaned VOID video could not be downloaded.",
      );
    }

    await fs.writeFile(
      outputSegmentPath,
      new Uint8Array(
        await outputResponse.arrayBuffer(),
      ),
    );

    logVoidStage(
      "VOID result download and file write",
    );
  } finally {
    await Promise.allSettled([
      videoObject.delete(),
      maskObject.delete(),
    ]);
  }
}

function normalizeSubtitleText(text) {
  return text
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createSubtitleCues({
  analysisResults,
  duration,
}) {
  const cues = [];
  let currentCue = null;

  for (const result of analysisResults) {
    const englishText = normalizeSubtitleText(
      result.englishText,
    );

    if (!englishText) {
      if (currentCue) {
        cues.push(currentCue);
        currentCue = null;
      }

      continue;
    }

    if (
      currentCue &&
      currentCue.text.toLowerCase() ===
        englishText.toLowerCase()
    ) {
      currentCue.end = Math.min(
        result.timestamp + SAMPLE_INTERVAL_SECONDS,
        duration,
      );
      continue;
    }

    if (currentCue) {
      cues.push(currentCue);
    }

    currentCue = {
      start: result.timestamp,
      end: Math.min(
        result.timestamp + SAMPLE_INTERVAL_SECONDS,
        duration,
      ),
      text: englishText,
      box: result.box,
    };
  }

  if (currentCue) {
    cues.push(currentCue);
  }

  return cues;
}

function formatSrtTimestamp(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const wholeSeconds = Math.floor(safeSeconds);
  const milliseconds = Math.round(
    (safeSeconds - wholeSeconds) * 1000,
  );
  const seconds = wholeSeconds % 60;
  const totalMinutes = Math.floor(wholeSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    `${String(seconds).padStart(2, "0")},${String(
      milliseconds,
    ).padStart(3, "0")}`,
  ].join(":");
}

function createSrtFile(cues) {
  return cues
    .map(
      (cue, index) => `${index + 1}
${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}
${cue.text}
`,
    )
    .join("\n");
}

function escapeSubtitlePath(subtitlePath) {
  return subtitlePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}
 function getVideoFontPath() {
  if (process.env.VIDEO_FONT_PATH) {
    return process.env.VIDEO_FONT_PATH
      .replace(/\\/g, "/")
      .replace(/:/g, "\\:");
  }

  if (process.platform === "win32") {
    return "C\\:/Windows/Fonts/arial.ttf";
  }

  return "/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf";
}
function escapeDrawText(text) {

  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/%/g, "\\%");
}

function createReplacementFilter(
  cues,
  videoWidth,
  videoHeight,
) {
  const filters = [];
  const fontPath = getVideoFontPath();

  for (const cue of cues) {
    const start = cue.start.toFixed(3);
    const end = cue.end.toFixed(3);
    const suppliedBox = cue.box || {};

    const hasUsableBox =
      suppliedBox.width >= 2 &&
      suppliedBox.height >= 2;

    const box = hasUsableBox
      ? suppliedBox
      : {
          x: 5,
          y: 82,
          width: 90,
          height: 12,
        };

    const xPercentage = Math.max(
      box.x - 1,
      0,
    );
    const yPercentage = Math.max(
      box.y - 1,
      0,
    );
    const widthPercentage = Math.min(
      box.width + 2,
      100 - xPercentage,
    );
    const heightPercentage = Math.min(
      Math.max(box.height + 2, 6),
      100 - yPercentage,
    );

    const x = Math.floor(
      videoWidth * (xPercentage / 100),
    );
    const y = Math.floor(
      videoHeight * (yPercentage / 100),
    );
    const width = Math.max(
      Math.ceil(
        videoWidth *
          (widthPercentage / 100),
      ),
      2,
    );
    const height = Math.max(
      Math.ceil(
        videoHeight *
          (heightPercentage / 100),
      ),
      2,
    );

    const escapedText = escapeDrawText(
      cue.text,
    );
    const estimatedTextWidth = Math.max(
      cue.text.length * 0.6,
      1,
    );
    const fontSize = Math.max(
      18,
      Math.min(
        48,
        Math.floor(height * 0.6),
        Math.floor(
          width / estimatedTextWidth,
        ),
      ),
    );

    filters.push(
      `drawtext=fontfile='${fontPath}'` +
        `:text='${escapedText}'` +
        `:fontcolor=white:fontsize=${fontSize}` +
        `:borderw=2:bordercolor=black` +
        `:x=${x}+((${width}-text_w)/2)` +
        `:y=${y}+((${height}-text_h)/2)` +
        `:enable='gte(t,${start})*lt(t,${end})'`,
    );
  }

  return filters.join(",");
}

async function renderTranslatedVideo({
  videoPath,
  audioPath,
  subtitlePath,
  outputPath,
  cues,
  translationMode,
  videoWidth,
  videoHeight,
}) {
  const escapedSubtitlePath =
    escapeSubtitlePath(subtitlePath);

  const videoFilter =
    translationMode === "replace"
      ? createReplacementFilter(
          cues,
          videoWidth,
          videoHeight,
        )
      : `subtitles='${escapedSubtitlePath}'` +
        `:force_style='FontSize=22,` +
        `PrimaryColour=&H00FFFFFF,` +
        `OutlineColour=&H00000000,` +
        `BorderStyle=1,Outline=2,Shadow=1,` +
        `Alignment=2,MarginV=28'`;

  await runCommand(getFfmpegCommand(), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoPath,
    "-i",
    audioPath,
    "-vf",
    videoFilter,
    "-map",
    "0:v:0",
    "-map",
    "1:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    "-y",
    outputPath,
  ]);
}

export async function translateVideo({
  videoFile,
  sourceLanguage,
  translationMode = "subtitles",
}) {
  const processingStartedAt = Date.now();
  let stageStartedAt =
    processingStartedAt;

  function logVideoStage(stageName) {
    const completedAt = Date.now();

    console.log(
      `[VIDEO TIMING] ${stageName}: ` +
        `${(
          (completedAt - stageStartedAt) /
          1000
        ).toFixed(2)}s` +
        ` | Total: ${(
          (completedAt -
            processingStartedAt) /
          1000
        ).toFixed(2)}s`,
    );

    stageStartedAt = completedAt;
  }

  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "geanos-video-"),
  );

  const inputExtension =
    path.extname(videoFile.name || "") || ".mp4";

  const inputPath = path.join(
    temporaryDirectory,
    `input${inputExtension}`,
  );

  const frameDirectory = path.join(
    temporaryDirectory,
    "frames",
  );

  const maskFrameDirectory = path.join(
    temporaryDirectory,
    "mask-frames",
  );

  const voidSegmentDirectory = path.join(
    temporaryDirectory,
    "void-segments",
  );

  const voidMaskPath = path.join(
    temporaryDirectory,
    "void-mask.mp4",
  );

  const voidReassembledVideoPath = path.join(
    temporaryDirectory,
    "void-cleaned-video.mp4",
  );

  const voidConcatListPath = path.join(
    temporaryDirectory,
    "void-segments.txt",
  );

  const maskPath = path.join(
    temporaryDirectory,
    "propainter-mask.mp4",
  );

  const cleanedVideoPath = path.join(
    temporaryDirectory,
    "propainter-cleaned-video.mp4",
  );

  const subtitlePath = path.join(
    temporaryDirectory,
    "translated-subtitles.srt",
  );

  const outputPath = path.join(
    temporaryDirectory,
    "GEANOS-translated-video.mp4",
  );

  try {
    await fs.mkdir(frameDirectory);
    await fs.mkdir(voidSegmentDirectory);
    await fs.writeFile(
      inputPath,
      new Uint8Array(
        await videoFile.arrayBuffer(),
      ),
    );

    const {
      duration,
      width: videoWidth,
      height: videoHeight,
      frameRate,
      frameCount,
    } = await getVideoInformation(inputPath);

    logVideoStage(
      "Upload preparation and video metadata",
    );

    const frames = await extractAnalysisFrames({
      videoPath: inputPath,
      frameDirectory,
    });

    logVideoStage(
      "FFmpeg analysis-frame extraction",
    );

    if (frames.length === 0) {
      throw new Error(
        "No video frames could be extracted from the uploaded file.",
      );
    }

    const analysisResults = await analyseFrames({
      frames,
      sourceLanguage,
    });

    logVideoStage(
      "OpenAI text detection and translation",
    );

    const subtitleCues = createSubtitleCues({
      analysisResults,
      duration,
    });

    if (subtitleCues.length === 0) {
      throw new NoTranslatableVideoTextError();
    }

    await fs.writeFile(
      subtitlePath,
      createSrtFile(subtitleCues),
      "utf8",
    );

    logVideoStage(
      "Subtitle cue and file preparation",
    );

    let renderVideoPath = inputPath;

    if (translationMode === "replace") {
      await runFastVideoCleanup({
        inputPath,
        analysisResults,
        outputPath: cleanedVideoPath,
        duration,
        videoWidth,
        videoHeight,
      });

      logVideoStage(
        "FFmpeg fast text cleanup",
      );

      renderVideoPath = cleanedVideoPath;
    }

    await renderTranslatedVideo({
      videoPath: renderVideoPath,
      audioPath: inputPath,
      subtitlePath,
      outputPath,
      cues: subtitleCues,
      translationMode,
      videoWidth,
      videoHeight,
    });

    logVideoStage(
      "Final English overlay and audio render",
    );

    const completedVideo =
      await fs.readFile(outputPath);

    logVideoStage(
      "Completed video read",
    );

    return {
      videoBase64:
        completedVideo.toString("base64"),
      mimeType: "video/mp4",
      subtitleCount: subtitleCues.length,
    };
  } finally {
    await fs.rm(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }
}

export async function removeVideoText({
  videoFile,
  removalAreas,
}) {
  const processingStartedAt = Date.now();

  function logRemovalStage(stage) {
    console.log(
      `[TEXT REMOVAL TIMING] ${stage}: ${(
        (Date.now() - processingStartedAt) /
        1000
      ).toFixed(2)}s total`,
    );
  }

  const validRemovalAreas = (
    Array.isArray(removalAreas)
      ? removalAreas
      : []
  )
    .map((area) => ({
      x: clampPercentage(area?.x),
      y: clampPercentage(area?.y),
      width: clampPercentage(
        area?.width,
      ),
      height: clampPercentage(
        area?.height,
      ),
      startTime: Math.max(
        Number(area?.startTime) || 0,
        0,
      ),
      endTime:
        Number(area?.endTime) || 0,
           cleanupMethod:
        area?.cleanupMethod === "local" ||
        area?.cleanupMethod === "background"
          ? area.cleanupMethod
          : "diagnostic",
    }))
    .filter(
      (area) =>
        area.width >= 0.5 &&
        area.height >= 0.5 &&
        Number.isFinite(
          area.startTime,
        ) &&
        Number.isFinite(area.endTime) &&
        area.endTime > area.startTime &&
        area.x + area.width <= 100 &&
        area.y + area.height <= 100,
    )
    .slice(0, 20);

  if (validRemovalAreas.length === 0) {
    throw new Error(
      "Mark at least one text area with a valid start and end time before processing the video.",
    );
  }

  const temporaryDirectory =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        "geanos-text-removal-",
      ),
    );

  const inputExtension =
    path.extname(
      videoFile.name || "",
    ) || ".mp4";

  const inputPath = path.join(
    temporaryDirectory,
    `input${inputExtension}`,
  );

  const outputPath = path.join(
    temporaryDirectory,
    "GEANOS-text-removed-video.mp4",
  );

  try {
    await fs.writeFile(
      inputPath,
      new Uint8Array(
        await videoFile.arrayBuffer(),
      ),
    );

    logRemovalStage("Input saved");

    const {
      width: videoWidth,
      height: videoHeight,
    } = await getVideoInformation(
      inputPath,
    );

    logRemovalStage("Video inspected");

    const filterParts = [];
    let currentVideoLabel = "0:v:0";

    validRemovalAreas.forEach(
      (area, index) => {
        const x = Math.max(
          Math.floor(
            videoWidth * (area.x / 100),
          ),
          0,
        );

        const y = Math.max(
          Math.floor(
            videoHeight * (area.y / 100),
          ),
          0,
        );

        const width = Math.max(
          Math.min(
            Math.ceil(
              videoWidth *
                (area.width / 100),
            ),
            videoWidth - x,
          ),
          2,
        );

        const height = Math.max(
          Math.min(
            Math.ceil(
              videoHeight *
                (area.height / 100),
            ),
            videoHeight - y,
          ),
          2,
        );

        const timeRange =
          `enable='between(t,${area.startTime.toFixed(
            3,
          )},${area.endTime.toFixed(
            3,
          )})'`;

        const outputLabel =
          `processed_${index}`;

        console.log(
          "[TEXT REMOVAL DIAGNOSTIC]",
          {
            browserPercentages: area,
            encodedPixels: {
              x,
              y,
              width,
              height,
            },
            encodedVideo: {
              width: videoWidth,
              height: videoHeight,
            },
            activeTimeRange: {
              startTime: area.startTime,
              endTime: area.endTime,
            },
            cleanupMethod:
              area.cleanupMethod,
          },
        );

              if (
          area.cleanupMethod ===
          "background"
        ) {
          const horizontalPadding =
            Math.max(
              4,
              Math.round(videoWidth * 0.005),
            );

          const verticalPadding =
            Math.max(
              4,
              Math.round(videoHeight * 0.008),
            );

          const safeX = Math.max(
            0,
            x - horizontalPadding,
          );

          const safeY = Math.max(
            0,
            y - verticalPadding,
          );

          const safeRight = Math.min(
            videoWidth,
            x +
              width +
              horizontalPadding,
          );

          const safeBottom = Math.min(
            videoHeight,
            y +
              height +
              verticalPadding,
          );

          const safeWidth = Math.max(
            2,
            safeRight - safeX,
          );

          const safeHeight = Math.max(
            2,
            safeBottom - safeY,
          );

          const sampleHeight = Math.max(
            2,
            Math.min(
              12,
              Math.floor(
                safeHeight / 6,
              ),
            ),
          );

          const sampleGap = Math.max(
            6,
            sampleHeight,
          );

          const spaceBelow =
            videoHeight -
            (safeY + safeHeight);

          const sourceY =
            spaceBelow >=
            sampleGap + sampleHeight
              ? safeY +
                safeHeight +
                sampleGap
              : Math.max(
                  0,
                  safeY -
                    sampleGap -
                    sampleHeight,
                );

          const splitBaseLabel =
            `background_base_${index}`;
          const splitSourceLabel =
            `background_source_${index}`;
          const patchLabel =
            `background_patch_${index}`;
          const scaledPatchLabel =
            `background_scaled_${index}`;
          const softenedPatchLabel =
            `background_softened_${index}`;

          filterParts.push(
            `[${currentVideoLabel}]split=2` +
              `[${splitBaseLabel}]` +
              `[${splitSourceLabel}]`,
          );

          filterParts.push(
            `[${splitSourceLabel}]` +
              `crop=w=${safeWidth}` +
              `:h=${sampleHeight}` +
              `:x=${safeX}:y=${sourceY}` +
              `[${patchLabel}]`,
          );

          filterParts.push(
            `[${patchLabel}]` +
              `scale=w=${safeWidth}` +
              `:h=${safeHeight}` +
              `[${scaledPatchLabel}]`,
          );

          filterParts.push(
            `[${scaledPatchLabel}]` +
              "gblur=sigma=2" +
              `[${softenedPatchLabel}]`,
          );

          filterParts.push(
            `[${splitBaseLabel}]` +
              `[${softenedPatchLabel}]` +
              `overlay=x=${safeX}` +
              `:y=${safeY}` +
              `:${timeRange}` +
              `[${outputLabel}]`,
          );

          currentVideoLabel =
            outputLabel;
          return;
        }

        if (
          area.cleanupMethod === "local"
        ) {
          const safeX = Math.max(1, x);
          const safeY = Math.max(1, y);
          const safeWidth = Math.max(
            2,
            Math.min(
              width,
              videoWidth - safeX - 1,
            ),
          );
          const safeHeight = Math.max(
            2,
            Math.min(
              height,
              videoHeight - safeY - 1,
            ),
          );

          filterParts.push(
            `[${currentVideoLabel}]` +
              `delogo=x=${safeX}` +
              `:y=${safeY}` +
              `:w=${safeWidth}` +
              `:h=${safeHeight}` +
              ":show=0" +
              `:${timeRange}` +
              `[${outputLabel}]`,
          );

          currentVideoLabel =
            outputLabel;
          return;
        }

        filterParts.push(
          `[${currentVideoLabel}]` +
            `drawbox=x=${x}:y=${y}` +
            `:w=${width}:h=${height}` +
            ":color=red@0.95:t=5" +
            `:${timeRange}` +
            `[${outputLabel}]`,
        );

        currentVideoLabel = outputLabel;
      },
    );

    await runCommand(getFfmpegCommand(), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      `[${currentVideoLabel}]`,
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      "-y",
      outputPath,
    ]);
    logRemovalStage(
      "FFmpeg cleanup completed",
    );   

    const completedVideo =
      await fs.readFile(outputPath);

    logRemovalStage(
      "Completed video read",
    );

    return {
      videoBase64:
        completedVideo.toString(
          "base64",
        ),
      mimeType: "video/mp4",
      removalAreaCount:
        validRemovalAreas.length,
    };
  } finally {
    await fs.rm(
      temporaryDirectory,
      {
        recursive: true,
        force: true,
      },
    );
  }
}