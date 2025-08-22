import { z } from "zod";

// Video validation schema
export const videoFileSchema = z.object({
  name: z.string().min(1),
  size: z.number().max(100 * 1024 * 1024), // 100MB max
  type: z.string().refine((type) => 
    type.startsWith("video/") && 
    ["video/mp4", "video/quicktime", "video/avi", "video/webm", "video/x-msvideo"].includes(type)
  ),
});

// Video metadata interface
export interface VideoMetadata {
  id: string;
  fileName: string;
  originalName: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  format: string;
  uploadedAt: Date;
  status: "uploading" | "processing" | "ready" | "error";
  analysisStatus?: "pending" | "processing" | "completed" | "failed";
  storageUrl?: string;
}

// Analysis job interface for GCP processing
export interface VideoAnalysisJob {
  videoId: string;
  storageUrl: string;
  status: "queued" | "processing" | "completed" | "failed";
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  results?: {
    sceneGraph?: string; // URI to scene graph data
    masks?: string; // URI to segmentation masks
    flow?: string; // URI to optical flow data
    depth?: string; // URI to depth maps
  };
}

// Validate video file client-side
export function validateVideoFile(file: File): { valid: boolean; error?: string } {
  try {
    videoFileSchema.parse({
      name: file.name,
      size: file.size,
      type: file.type,
    });
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, error: error.errors[0]?.message || "Invalid video file" };
    }
    return { valid: false, error: "Unknown validation error" };
  }
}

// Get video metadata using HTML5 video element
export function getVideoMetadata(file: File): Promise<{
  duration: number;
  width: number;
  height: number;
  fps?: number;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    
    video.onloadedmetadata = () => {
      const metadata = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        fps: undefined as number | undefined,
      };
      
      URL.revokeObjectURL(url);
      resolve(metadata);
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load video metadata"));
    };
    
    video.src = url;
  });
}

// Upload video file using presigned URL
export async function uploadVideoFile(
  file: File,
  uploadUrl: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = (event.loaded / event.total) * 100;
        onProgress(progress);
      }
    };
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status: ${xhr.status}`));
      }
    };
    
    xhr.onerror = () => {
      reject(new Error("Upload failed"));
    };
    
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });
}

// Create video analysis job
export async function createVideoAnalysisJob(videoId: string, fileName: string): Promise<VideoAnalysisJob> {
  // Construct GCS storage URL
  const storageUrl = `gs://${process.env.GCS_BUCKET_NAME}/${fileName}`;
  
  // This will later connect to the FastAPI ingest-api microservice on GCP
  // For now, return a mock job
  return {
    videoId,
    storageUrl,
    status: "queued",
    createdAt: new Date(),
  };
}

// Get GCS public URL for a file (for viewing)
export function getGCSPublicUrl(fileName: string): string {
  return `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${fileName}`;
}

// Get file extension from filename
export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() || "" : "";
}

// Check if file is video
export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

// Convert bytes to human readable format
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Format duration in seconds to MM:SS
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}