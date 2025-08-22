import { toast } from "sonner";
import {
  getFileType,
  generateVideoThumbnail,
  getMediaDuration,
  getImageDimensions,
  type MediaItem,
} from "@/stores/media-store";
import { generateThumbnail, getVideoInfo } from "./ffmpeg-utils";
import { 
  validateVideoFile, 
  getVideoMetadata, 
  uploadVideoFile, 
  createVideoAnalysisJob,
  getFileExtension,
  isVideoFile 
} from "./video-processing";

export interface ProcessedMediaItem extends Omit<MediaItem, "id"> {}

export interface SemanticVideoItem extends ProcessedMediaItem {
  videoId?: string;
  storageUrl?: string;
  analysisStatus?: "pending" | "processing" | "completed" | "failed";
}

export async function processMediaFiles(
  files: FileList | File[],
  onProgress?: (progress: number) => void
): Promise<ProcessedMediaItem[]> {
  const fileArray = Array.from(files);
  const processedItems: ProcessedMediaItem[] = [];

  const total = fileArray.length;
  let completed = 0;

  for (const file of fileArray) {
    const fileType = getFileType(file);

    if (!fileType) {
      toast.error(`Unsupported file type: ${file.name}`);
      continue;
    }

    const url = URL.createObjectURL(file);
    let thumbnailUrl: string | undefined;
    let duration: number | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let fps: number | undefined;

    try {
      if (fileType === "image") {
        // Get image dimensions
        const dimensions = await getImageDimensions(file);
        width = dimensions.width;
        height = dimensions.height;
      } else if (fileType === "video") {
        try {
          // Use FFmpeg for comprehensive video info extraction
          const videoInfo = await getVideoInfo(file);
          duration = videoInfo.duration;
          width = videoInfo.width;
          height = videoInfo.height;
          fps = videoInfo.fps;

          // Generate thumbnail using FFmpeg
          thumbnailUrl = await generateThumbnail(file, 1);
        } catch (error) {
          console.warn(
            "FFmpeg processing failed, falling back to basic processing:",
            error
          );
          // Fallback to basic processing
          const videoResult = await generateVideoThumbnail(file);
          thumbnailUrl = videoResult.thumbnailUrl;
          width = videoResult.width;
          height = videoResult.height;
          duration = await getMediaDuration(file);
          // FPS will remain undefined for fallback
        }
      } else if (fileType === "audio") {
        // For audio, we don't set width/height/fps (they'll be undefined)
        duration = await getMediaDuration(file);
      }

      processedItems.push({
        name: file.name,
        type: fileType,
        file,
        url,
        thumbnailUrl,
        duration,
        width,
        height,
        fps,
      });

      // Yield back to the event loop to keep the UI responsive
      await new Promise((resolve) => setTimeout(resolve, 0));

      completed += 1;
      if (onProgress) {
        const percent = Math.round((completed / total) * 100);
        onProgress(percent);
      }
    } catch (error) {
      console.error("Error processing file:", file.name, error);
      toast.error(`Failed to process ${file.name}`);
      URL.revokeObjectURL(url); // Clean up on error
    }
  }

  return processedItems;
}

// Enhanced processing for semantic video projects
export async function processSemanticVideoFiles(
  files: FileList | File[],
  onProgress?: (progress: number) => void
): Promise<SemanticVideoItem[]> {
  const fileArray = Array.from(files);
  const processedItems: SemanticVideoItem[] = [];

  const total = fileArray.length;
  let completed = 0;

  for (const file of fileArray) {
    const fileType = getFileType(file);

    if (!fileType) {
      toast.error(`Unsupported file type: ${file.name}`);
      continue;
    }

    // For video files, use the new semantic video processing pipeline
    if (fileType === "video" && isVideoFile(file)) {
      try {
        // Validate video file
        const validation = validateVideoFile(file);
        if (!validation.valid) {
          toast.error(`Invalid video file: ${validation.error}`);
          continue;
        }

        // Get video metadata
        const metadata = await getVideoMetadata(file);
        
        // Check MVP constraints (10 seconds max)
        if (metadata.duration > 10) {
          toast.error(`Video ${file.name} is too long. Max duration for MVP is 10 seconds.`);
          continue;
        }

        toast.info(`Preparing ${file.name} for semantic analysis...`);

        // Get upload URL for semantic video
        const uploadResponse = await fetch("/api/video-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileExtension: getFileExtension(file.name),
            fileSize: file.size,
            duration: metadata.duration,
          }),
        });

        if (!uploadResponse.ok) {
          const error = await uploadResponse.json();
          toast.error(`Failed to prepare video upload: ${error.message || "Unknown error"}`);
          continue;
        }

        const { uploadUrl, fileName, videoId } = await uploadResponse.json();

        // Upload video file to cloud storage
        toast.info(`Uploading ${file.name} to cloud storage...`);
        await uploadVideoFile(file, uploadUrl, (uploadProgress) => {
          // Update progress to include upload progress
          const baseProgress = (completed / total) * 100;
          const currentProgress = baseProgress + (uploadProgress / total);
          onProgress?.(Math.min(currentProgress, 100));
        });

        // Create video analysis job
        const analysisJob = await createVideoAnalysisJob(videoId, fileName);

        // Generate local thumbnail for immediate display
        let thumbnailUrl: string | undefined;
        try {
          thumbnailUrl = await generateThumbnail(file, 1);
        } catch (error) {
          console.warn("Failed to generate thumbnail:", error);
          const fallback = await generateVideoThumbnail(file);
          thumbnailUrl = fallback.thumbnailUrl;
        }

        // Create object URL for local preview until upload is processed
        const localUrl = URL.createObjectURL(file);

        processedItems.push({
          name: file.name,
          type: fileType,
          file,
          url: localUrl, // Use local URL initially
          thumbnailUrl,
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          fps: metadata.fps,
          videoId,
          storageUrl: analysisJob.storageUrl,
          analysisStatus: "pending",
        });

        toast.success(`${file.name} uploaded successfully. Queued for semantic analysis...`);

      } catch (error) {
        console.error("Error processing semantic video:", error);
        toast.error(`Failed to process video ${file.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    } else {
      // For non-video files, use standard processing
      const url = URL.createObjectURL(file);
      let thumbnailUrl: string | undefined;
      let duration: number | undefined;
      let width: number | undefined;
      let height: number | undefined;
      let fps: number | undefined;

      try {
        if (fileType === "image") {
          const dimensions = await getImageDimensions(file);
          width = dimensions.width;
          height = dimensions.height;
        } else if (fileType === "audio") {
          duration = await getMediaDuration(file);
        }

        processedItems.push({
          name: file.name,
          type: fileType,
          file,
          url,
          thumbnailUrl,
          duration,
          width,
          height,
          fps,
        });

      } catch (error) {
        console.error("Error processing file:", file.name, error);
        toast.error(`Failed to process ${file.name}`);
        URL.revokeObjectURL(url);
      }
    }

    completed += 1;
    if (onProgress) {
      const percent = Math.round((completed / total) * 100);
      onProgress(percent);
    }

    // Yield to event loop
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return processedItems;
}
