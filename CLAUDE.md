# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Vision

VaakCut is building a **semantic video editor** that treats video as a DOM-like, object-aware representation rather than pixel grids. The goal is programmable video manipulation where every element is addressable and modifiable through AI-powered segmentation and tracking.

### Core Concept
- **Generative AI native video format**: Scene graph encoded into video format instead of MP4 pixel grids
- **Two-phase approach**: Analysis phase (30-60s) followed by interactive editing
- **Object-centric editing**: Click-to-select, remove, reposition, and transform video objects
- **Temporal consistency**: Flow-guided propagation for coherent video manipulation
- **Living scene graph**: Every video element is addressable and modifiable like DOM elements

## Development Commands

### Setup and Installation
- `cd apps/web` - Navigate to main web application
- `bun install` - Install dependencies (uses Bun package manager)
- `cp .env.example .env.local` - Copy environment configuration

### Development Server
- `bun run dev` - Start development server with Turbopack (from apps/web)
- `docker-compose up -d` - Start database and Redis services (from project root)

### Database Operations
- `bun run db:generate` - Generate Drizzle migrations (from apps/web)
- `bun run db:migrate` - Run database migrations (from apps/web)
- `bun run db:push:local` - Push schema changes to local database
- `bun run db:push:prod` - Push schema changes to production database

### Code Quality
- `bun run lint` - Run Biome linter on src/ directory (from apps/web)
- `bun run lint:fix` - Run Biome linter with auto-fix
- `bun run format` - Format code using Biome
- `turbo run check-types` - Type checking across workspace (from project root)

### Building and Production
- `bun run build` - Build the Next.js application (from apps/web)
- `turbo run build` - Build all workspace packages (from project root)

## Architecture Overview

### Current State (OpenCut Base)
- **Turborepo** workspace with Bun package manager
- **apps/web/** - Main Next.js 15 application (App Router)
- **apps/transcription/** - Python transcription service
- **packages/** - Shared workspace packages (@opencut/auth, @opencut/db)

### Technology Stack
- **Frontend**: Next.js 15, React 18, TypeScript 5.8, Tailwind CSS 4
- **State Management**: Zustand with persistence middleware
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Better Auth
- **Media Processing**: FFmpeg.js for client-side video processing
- **UI Components**: Radix UI primitives with custom components
- **Styling**: Tailwind CSS with Biome for formatting/linting

### Key Directories in apps/web/src/
- **stores/** - Zustand state management (editor, timeline, playback, etc.)
- **components/editor/** - Core video editing interface components
  - **media-panel/** - Media library and asset management
  - **preview-panel.tsx** - Main video preview area (target for click-to-select)
  - **properties-panel/** - Object properties and controls
  - **timeline/** - Timeline tracks and elements
- **components/ui/** - Reusable UI components built on Radix primitives
- **hooks/** - Custom React hooks for editor functionality
- **lib/** - Utilities including FFmpeg, media processing, timeline logic
- **types/** - TypeScript definitions for editor, timeline, and project structures

### State Management Pattern
The application uses Zustand stores with specific responsibilities:
- **editor-store.ts** - Canvas presets, layout guides, initialization state
- **timeline-store.ts** - Timeline tracks, elements, and editing operations
- **playback-store.ts** - Video playback controls and timing
- **project-store.ts** - Project metadata and persistence
- **media-store.ts** - Media file management and processing

## VaakCut Semantic Video Implementation

### MVP Demo Flow
1. User uploads 5-10 second video clip
2. System processes with SAM 2 to create object segments (30-60s analysis)
3. User clicks on any object (like a raised hand)
4. System shows object boundary and tracking
5. User can drag to reposition, delete object, or apply transformations
6. System renders modified video maintaining temporal consistency

### Planned Architecture Extension
- **Frontend**: React + Canvas/WebGL for overlays and scrubbing
- **Backend API**: FastAPI microservices
- **Workers**: Python on GPU for vision models (on GCP)
- **Storage**: GCS for media, Redis for task state, Postgres for scene graph

### Core AI Models (All on GCP - DO NOT RUN LOCALLY)
- **SAM 2**: Object segmentation and tracking (Apache 2.0 license, streaming memory, click-to-mask)
- **Grounding DINO**: Text-to-object selection (boxes → SAM 2 masks)
- **Depth-Anything v2**: Monocular depth estimation
- **RAFT/FlowFormer**: Optical flow computation
- **ProPainter/E2FGVI**: Video inpainting (demo quality, non-commercial)
- **LaMa/ZITS++**: Fallback inpainting with temporal stitching

### Semantic Layer Architecture
- **Scene Graph Nodes**: {track_id, mask_id, bbox, depth_z, clip_embedding}
- **Scene Graph Edges**: {occludes, occluded_by, follows}
- **Timed Metadata**: MP4 metadata track (JSON per sample) for light cues
- **Sidecar Data**: Heavy artifacts (masks, flow, depth) in NDJSON/Parquet tables
- **Always include**: media SHA-256, fps, time_base, schema_version, model versions

### Planned Microservices
1. **ingest-api**: Handle video uploads, store in GCS, create projects
2. **segmentation-api**: SAM 2 processing and object tracking
3. **scene-graph-api**: Provide semantic scene graph data
4. **edit-api**: Object removal, repositioning using inpainting models

### Performance Targets
- Analysis: 10s 1080p video in 30-60s on 1 consumer GPU
- Interactive mask ops: <100ms per frame using cached artifacts
- Export: 1080p at near realtime on GPU for classical operations

### Planned APIs (Sketch)
- `POST /ingest {video_uri}` - Video upload and initial processing
- `GET /analysis/{id}` → {tracks, masks_uri, flow_uri, depth_uri}
- `POST /select {query or click}` → {track_id, frames[]}
- `POST /edit {op, params, targets}` → preview_uri
- `POST /render {timeline}` → output_uri

## Environment Configuration
Required environment variables (see README.md for full setup):
- `DATABASE_URL` - PostgreSQL connection
- `BETTER_AUTH_SECRET` - Authentication secret
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` - Redis configuration
- `MARBLE_WORKSPACE_KEY` - Blog CMS integration

## Development Focus Areas

### Current OpenCut Areas
- **Active development**: Timeline functionality, project management, performance optimization
- **Under refactoring**: Preview panel (fonts, stickers, effects) and export functionality
- **Testing**: No specific test framework identified - check with user for testing approach

### VaakCut Extension Areas (Planned)
- **Frontend enhancements**: 
  - Click-to-select interface in `PreviewPanel`
  - Object timeline tracks in `Timeline` component  
  - Semantic properties in `PropertiesPanel`
- **New microservices**: All AI processing on GCP
- **Data layer**: Timed metadata format, sidecar artifact storage, scene graph persistence

## Important Constraints
- **NO LOCAL AI MODEL EXECUTION**: All model inference must run on GCP (user is on M4 MacBook Air with 16GB memory)
- **License compliance**: Check all model licenses before implementation
  - SAM 2: Permissive license suitable for production
  - ProPainter/E2FGVI: Non-commercial, demo only
  - LaMa/ZITS++: Verify permissive forks before shipping
- **Two-phase workflow**: Analysis phase followed by interactive editing
- **Temporal consistency**: Flow-guided propagation for all video manipulations

## Risks and Mitigations
- **Mask chatter at hair/edges**: Add video matting head for human close-ups and alpha blend
- **ID drift across occlusions**: Tracker + periodic re-anchor on shot changes
- **Diffusion flicker**: TokenFlow/RAVE or restrict to classical edits first
- **Latency spikes**: Cache everything in sidecar and prefetch next N frames