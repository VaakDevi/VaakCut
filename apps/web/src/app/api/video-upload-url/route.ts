import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Storage } from "@google-cloud/storage";
import { nanoid } from "nanoid";
import { env } from "@/env";
import { baseRateLimit } from "@/lib/rate-limit";

const videoUploadRequestSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  fileExtension: z.enum(["mp4", "mov", "avi", "webm", "mkv"], {
    errorMap: () => ({
      message: "File extension must be mp4, mov, avi, webm, or mkv",
    }),
  }),
  fileSize: z.number().max(100 * 1024 * 1024, { // 100MB max for MVP
    message: "File size must be less than 100MB",
  }),
  duration: z.number().max(10, { // 10 seconds max for MVP
    message: "Video duration must be less than 10 seconds for MVP",
  }).optional(),
});

const apiResponseSchema = z.object({
  uploadUrl: z.string().url(),
  fileName: z.string().min(1),
  videoId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting (skip in development if Redis not available)
    if (process.env.NODE_ENV === "production") {
      const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
      try {
        const { success } = await baseRateLimit.limit(ip);
        if (!success) {
          return NextResponse.json({ error: "Too many requests" }, { status: 429 });
        }
      } catch (rateError) {
        console.warn("Rate limiting service unavailable, proceeding without rate limiting");
      }
    }

    // Parse and validate request body
    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const validationResult = videoUploadRequestSchema.safeParse(rawBody);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request parameters",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { fileName: originalFileName, fileExtension, fileSize } = validationResult.data;

    // Check if GCP storage is configured
    if (!process.env.GOOGLE_CLOUD_PROJECT_ID || !process.env.GCS_BUCKET_NAME) {
      console.error("Missing GCP storage configuration for video uploads");
      return NextResponse.json(
        {
          error: "Video storage not configured",
          message: "Video uploads require GCP Cloud Storage configuration. Set GOOGLE_CLOUD_PROJECT_ID and GCS_BUCKET_NAME environment variables.",
        },
        { status: 503 }
      );
    }

    // Initialize GCS client
    const storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      // Authentication will use Application Default Credentials or service account key
    });

    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);

    // Generate unique video ID and preserve original filename
    const videoId = nanoid();
    const timestamp = Date.now();
    // Sanitize original filename by removing extension and unsafe characters
    const sanitizedName = originalFileName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "-");
    const fileName = `videos/${timestamp}-${videoId}-${sanitizedName}.${fileExtension}`;

    // Create signed URL for upload (1 hour expiry)
    const [signedUrl] = await bucket.file(fileName).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
      contentType: `video/${fileExtension === 'mov' ? 'quicktime' : fileExtension}`,
    });

    // Prepare and validate response
    const responseData = {
      uploadUrl: signedUrl,
      fileName,
      videoId,
    };

    const responseValidation = apiResponseSchema.safeParse(responseData);
    if (!responseValidation.success) {
      console.error(
        "Invalid API response structure:",
        responseValidation.error
      );
      return NextResponse.json(
        { error: "Internal response formatting error" },
        { status: 500 }
      );
    }

    return NextResponse.json(responseValidation.data);
  } catch (error) {
    console.error("Error generating GCS video upload URL:", error);
    return NextResponse.json(
      {
        error: "Failed to generate video upload URL",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}