"use client";

import { useTimelineStore } from "@/stores/timeline-store";
import { TimelineElement, TimelineTrack } from "@/types/timeline";
import { useMediaStore, type MediaItem } from "@/stores/media-store";
import { usePlaybackStore } from "@/stores/playback-store";
import { useEditorStore } from "@/stores/editor-store";
import { useObjectSelectionStore, type ClickCoordinate } from "@/stores/object-selection-store";
import { VideoPlayer } from "@/components/ui/video-player";
import { AudioPlayer } from "@/components/ui/audio-player";
import { Button } from "@/components/ui/button";
import { Play, Pause, Expand, SkipBack, SkipForward, Target } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { formatTimeCode } from "@/lib/time";
import { EditableTimecode } from "@/components/ui/editable-timecode";
import { FONT_CLASS_MAP } from "@/lib/font-config";
import { DEFAULT_CANVAS_SIZE, DEFAULT_FPS, useProjectStore } from "@/stores/project-store";
import { TextElementDragState } from "@/types/editor";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { LayoutGuideOverlay } from "./layout-guide-overlay";
import { Label } from "../ui/label";
import { SocialsIcon } from "../icons";
import { PLATFORM_LAYOUTS, type PlatformLayout } from "@/stores/editor-store";

interface ActiveElement {
  element: TimelineElement;
  track: TimelineTrack;
  mediaItem: MediaItem | null;
}

export function PreviewPanel() {
  const { tracks, getTotalDuration, updateTextElement } = useTimelineStore();
  const { mediaItems } = useMediaStore();
  const { currentTime, toggle, setCurrentTime } = usePlaybackStore();
  const { activeProject } = useProjectStore();
  const { 
    isSelectionMode, 
    isProcessingSelection,
    selectedObjects,
    setSelectionMode, 
    addClickCoordinate, 
    clearPendingClick,
    getObjectsByVideo
  } = useObjectSelectionStore();
  const previewRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [previewDimensions, setPreviewDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [isExpanded, setIsExpanded] = useState(false);

  const canvasSize = activeProject?.canvasSize || DEFAULT_CANVAS_SIZE;
  const [dragState, setDragState] = useState<TextElementDragState>({
    isDragging: false,
    elementId: null,
    trackId: null,
    startX: 0,
    startY: 0,
    initialElementX: 0,
    initialElementY: 0,
    currentX: 0,
    currentY: 0,
    elementWidth: 0,
    elementHeight: 0,
  });

  useEffect(() => {
    const updatePreviewSize = () => {
      if (!containerRef.current) return;

      let availableWidth, availableHeight;

      if (isExpanded) {
        const controlsHeight = 80;
        const marginSpace = 24;
        availableWidth = window.innerWidth - marginSpace;
        availableHeight = window.innerHeight - controlsHeight - marginSpace;
      } else {
        const container = containerRef.current.getBoundingClientRect();
        const computedStyle = getComputedStyle(containerRef.current);
        const paddingTop = parseFloat(computedStyle.paddingTop);
        const paddingBottom = parseFloat(computedStyle.paddingBottom);
        const paddingLeft = parseFloat(computedStyle.paddingLeft);
        const paddingRight = parseFloat(computedStyle.paddingRight);
        const gap = parseFloat(computedStyle.gap) || 16;
        const toolbar = containerRef.current.querySelector("[data-toolbar]");
        const toolbarHeight = toolbar
          ? toolbar.getBoundingClientRect().height
          : 0;

        availableWidth = container.width - paddingLeft - paddingRight;
        availableHeight =
          container.height -
          paddingTop -
          paddingBottom -
          toolbarHeight -
          (toolbarHeight > 0 ? gap : 0);
      }

      const targetRatio = canvasSize.width / canvasSize.height;
      const containerRatio = availableWidth / availableHeight;
      let width, height;

      if (containerRatio > targetRatio) {
        height = availableHeight * (isExpanded ? 0.95 : 1);
        width = height * targetRatio;
      } else {
        width = availableWidth * (isExpanded ? 0.95 : 1);
        height = width / targetRatio;
      }

      setPreviewDimensions({ width, height });
    };

    updatePreviewSize();
    const resizeObserver = new ResizeObserver(updatePreviewSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    if (isExpanded) {
      window.addEventListener("resize", updatePreviewSize);
    }

    return () => {
      resizeObserver.disconnect();
      if (isExpanded) {
        window.removeEventListener("resize", updatePreviewSize);
      }
    };
  }, [canvasSize.width, canvasSize.height, isExpanded]);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isExpanded) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "";
    };
  }, [isExpanded]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.isDragging) return;

      const deltaX = e.clientX - dragState.startX;
      const deltaY = e.clientY - dragState.startY;

      const scaleRatio = previewDimensions.width / canvasSize.width;
      const newX = dragState.initialElementX + deltaX / scaleRatio;
      const newY = dragState.initialElementY + deltaY / scaleRatio;

      const halfWidth = dragState.elementWidth / scaleRatio / 2;
      const halfHeight = dragState.elementHeight / scaleRatio / 2;

      const constrainedX = Math.max(
        -canvasSize.width / 2 + halfWidth,
        Math.min(canvasSize.width / 2 - halfWidth, newX)
      );
      const constrainedY = Math.max(
        -canvasSize.height / 2 + halfHeight,
        Math.min(canvasSize.height / 2 - halfHeight, newY)
      );

      setDragState((prev) => ({
        ...prev,
        currentX: constrainedX,
        currentY: constrainedY,
      }));
    };

    const handleMouseUp = () => {
      if (dragState.isDragging && dragState.trackId && dragState.elementId) {
        updateTextElement(dragState.trackId, dragState.elementId, {
          x: dragState.currentX,
          y: dragState.currentY,
        });
      }
      setDragState((prev) => ({ ...prev, isDragging: false }));
    };

    if (dragState.isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragState, previewDimensions, canvasSize, updateTextElement]);

  const handleTextMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    element: any,
    trackId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();

    setDragState({
      isDragging: true,
      elementId: element.id,
      trackId,
      startX: e.clientX,
      startY: e.clientY,
      initialElementX: element.x,
      initialElementY: element.y,
      currentX: element.x,
      currentY: element.y,
      elementWidth: rect.width,
      elementHeight: rect.height,
    });
  };

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleVideoClick = useCallback((
    e: React.MouseEvent<HTMLDivElement>, 
    mediaItem: MediaItem,
    element: TimelineElement
  ) => {
    if (!isSelectionMode || isProcessingSelection) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Convert click coordinates to relative coordinates (0-1 range)
    const relativeX = clickX / rect.width;
    const relativeY = clickY / rect.height;
    
    // Calculate current frame based on video timing
    const videoCurrentTime = currentTime - element.startTime + element.trimStart;
    const fps = mediaItem.fps || 30; // Default to 30fps if not available
    const currentFrame = Math.floor(videoCurrentTime * fps);
    
    const clickCoordinate: ClickCoordinate = {
      x: relativeX,
      y: relativeY,
      timestamp: currentTime,
      frame: currentFrame,
    };
    
    // Check if this is a semantic video (has videoId)
    const semanticVideoId = (mediaItem as any).videoId;
    if (semanticVideoId) {
      addClickCoordinate(clickCoordinate, semanticVideoId);
      console.log("Object selection click:", {
        videoId: semanticVideoId,
        coordinates: clickCoordinate,
        elementId: element.id
      });
    }
  }, [isSelectionMode, isProcessingSelection, currentTime, addClickCoordinate]);

  const hasAnyElements = tracks.some((track) => track.elements.length > 0);
  const getActiveElements = (): ActiveElement[] => {
    const activeElements: ActiveElement[] = [];

    // Iterate tracks from bottom to top so topmost track renders last (on top)
    [...tracks].reverse().forEach((track) => {
      track.elements.forEach((element) => {
        if (element.hidden) return;
        const elementStart = element.startTime;
        const elementEnd =
          element.startTime +
          (element.duration - element.trimStart - element.trimEnd);

        if (currentTime >= elementStart && currentTime < elementEnd) {
          let mediaItem = null;
          if (element.type === "media") {
            mediaItem =
              element.mediaId === "test"
                ? null
                : mediaItems.find((item) => item.id === element.mediaId) ||
                  null;
          }
          activeElements.push({ element, track, mediaItem });
        }
      });
    });

    return activeElements;
  };

  const activeElements = getActiveElements();

  // Get media elements for blur background (video/image only)
  const getBlurBackgroundElements = (): ActiveElement[] => {
    return activeElements.filter(
      ({ element, mediaItem }) =>
        element.type === "media" &&
        mediaItem &&
        (mediaItem.type === "video" || mediaItem.type === "image") &&
        element.mediaId !== "test" // Exclude test elements
    );
  };

  const blurBackgroundElements = getBlurBackgroundElements();

  // Render blur background layer
  const renderBlurBackground = () => {
    if (
      !activeProject?.backgroundType ||
      activeProject.backgroundType !== "blur" ||
      blurBackgroundElements.length === 0
    ) {
      return null;
    }

    // Use the first media element for background (could be enhanced to use primary/focused element)
    const backgroundElement = blurBackgroundElements[0];
    const { element, mediaItem } = backgroundElement;

    if (!mediaItem) return null;

    const blurIntensity = activeProject.blurIntensity || 8;

    if (mediaItem.type === "video") {
      return (
        <div
          key={`blur-${element.id}`}
          className="absolute inset-0 overflow-hidden"
          style={{
            filter: `blur(${blurIntensity}px)`,
            transform: "scale(1.1)", // Slightly zoom to avoid blur edge artifacts
            transformOrigin: "center",
          }}
        >
          <VideoPlayer
            src={mediaItem.url!}
            poster={mediaItem.thumbnailUrl}
            clipStartTime={element.startTime}
            trimStart={element.trimStart}
            trimEnd={element.trimEnd}
            clipDuration={element.duration}
            className="w-full h-full object-cover"
            trackMuted={true}
          />
        </div>
      );
    }

    if (mediaItem.type === "image") {
      return (
        <div
          key={`blur-${element.id}`}
          className="absolute inset-0 overflow-hidden"
          style={{
            filter: `blur(${blurIntensity}px)`,
            transform: "scale(1.1)", // Slightly zoom to avoid blur edge artifacts
            transformOrigin: "center",
          }}
        >
          <img
            src={mediaItem.url!}
            alt={mediaItem.name}
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>
      );
    }

    return null;
  };

  // Render an element
  const renderElement = (elementData: ActiveElement, index: number) => {
    const { element, mediaItem } = elementData;

    // Text elements
    if (element.type === "text") {
      const fontClassName =
        FONT_CLASS_MAP[element.fontFamily as keyof typeof FONT_CLASS_MAP] || "";

      const scaleRatio = previewDimensions.width / canvasSize.width;

      return (
        <div
          key={element.id}
          className="absolute cursor-grab"
          onMouseDown={(e) =>
            handleTextMouseDown(e, element, elementData.track.id)
          }
          style={{
            left: `${
              50 +
              ((dragState.isDragging && dragState.elementId === element.id
                ? dragState.currentX
                : element.x) /
                canvasSize.width) *
                100
            }%`,
            top: `${
              50 +
              ((dragState.isDragging && dragState.elementId === element.id
                ? dragState.currentY
                : element.y) /
                canvasSize.height) *
                100
            }%`,
            transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
            opacity: element.opacity,
            zIndex: 100 + index, // Text elements on top
          }}
        >
          <div
            className={fontClassName}
            style={{
              fontSize: `${element.fontSize * scaleRatio}px`,
              color: element.color,
              backgroundColor: element.backgroundColor,
              textAlign: element.textAlign,
              fontWeight: element.fontWeight,
              fontStyle: element.fontStyle,
              textDecoration: element.textDecoration,
              padding: `${4 * scaleRatio}px ${8 * scaleRatio}px`,
              borderRadius: `${2 * scaleRatio}px`,
              whiteSpace: "nowrap",
              // Fallback for system fonts that don't have classes
              ...(fontClassName === "" && { fontFamily: element.fontFamily }),
            }}
          >
            {element.content}
          </div>
        </div>
      );
    }

    // Media elements
    if (element.type === "media") {
      // Test elements
      if (!mediaItem || element.mediaId === "test") {
        return (
          <div
            key={element.id}
            className="absolute inset-0 bg-linear-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center"
          >
            <div className="text-center">
              <div className="text-2xl mb-2">🎬</div>
              <p className="text-xs text-foreground">{element.name}</p>
            </div>
          </div>
        );
      }

      // Video elements
      if (mediaItem.type === "video") {
        const semanticVideoId = (mediaItem as any).videoId;
        const hasSemanticData = Boolean(semanticVideoId);
        const videoObjects = hasSemanticData ? getObjectsByVideo(semanticVideoId) : [];
        
        return (
          <div
            key={element.id}
            className={cn(
              "absolute inset-0 flex items-center justify-center",
              isSelectionMode && hasSemanticData && "cursor-crosshair"
            )}
            onClick={(e) => handleVideoClick(e, mediaItem, element)}
          >
            <VideoPlayer
              src={mediaItem.url!}
              poster={mediaItem.thumbnailUrl}
              clipStartTime={element.startTime}
              trimStart={element.trimStart}
              trimEnd={element.trimEnd}
              clipDuration={element.duration}
              trackMuted={element.muted || elementData.track.muted}
            />
            
            {/* Object selection overlay */}
            {isSelectionMode && hasSemanticData && (
              <div className="absolute inset-0 bg-blue-500/10 border-2 border-dashed border-blue-500 rounded pointer-events-none flex items-center justify-center">
                <div className="bg-blue-500 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                  <Target size={12} />
                  Click to select object
                </div>
              </div>
            )}
            
            {/* Show segmented objects overlay */}
            {videoObjects.length > 0 && (
              <div className="absolute inset-0 pointer-events-none">
                {videoObjects.map(obj => {
                  const isSelected = selectedObjects.some(selected => selected.id === obj.id);
                  const currentFrameBox = obj.boundingBoxes.find(box => 
                    Math.abs(box.frame - Math.floor((currentTime - element.startTime + element.trimStart) * (mediaItem.fps || 30))) < 2
                  );
                  
                  if (!currentFrameBox) return null;
                  
                  return (
                    <div
                      key={obj.id}
                      className={cn(
                        "absolute border-2 rounded",
                        isSelected ? "border-green-400 bg-green-400/20" : "border-blue-400 bg-blue-400/10"
                      )}
                      style={{
                        left: `${currentFrameBox.x * 100}%`,
                        top: `${currentFrameBox.y * 100}%`,
                        width: `${currentFrameBox.width * 100}%`,
                        height: `${currentFrameBox.height * 100}%`,
                      }}
                    >
                      <div className={cn(
                        "absolute -top-6 left-0 px-1 py-0.5 rounded text-xs",
                        isSelected ? "bg-green-400 text-white" : "bg-blue-400 text-white"
                      )}>
                        {obj.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* Processing indicator */}
            {isProcessingSelection && hasSemanticData && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <div className="bg-white rounded-lg p-4 text-center">
                  <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                  <p className="text-sm">Processing selection...</p>
                </div>
              </div>
            )}
          </div>
        );
      }

      // Image elements
      if (mediaItem.type === "image") {
        return (
          <div
            key={element.id}
            className="absolute inset-0 flex items-center justify-center"
          >
            <img
              src={mediaItem.url!}
              alt={mediaItem.name}
              className="max-w-full max-h-full object-contain"
              draggable={false}
            />
          </div>
        );
      }

      // Audio elements (no visual representation)
      if (mediaItem.type === "audio") {
        return (
          <div
            key={element.id}
            className="absolute inset-0"
            style={{ pointerEvents: "none" }}
          >
            <AudioPlayer
              src={mediaItem.url!}
              clipStartTime={element.startTime}
              trimStart={element.trimStart}
              trimEnd={element.trimEnd}
              clipDuration={element.duration}
              trackMuted={element.muted || elementData.track.muted}
            />
          </div>
        );
      }
    }

    return null;
  };

  return (
    <>
      <div className="h-full w-full flex flex-col min-h-0 min-w-0 bg-panel rounded-sm relative">
        <div
          ref={containerRef}
          className="flex-1 flex flex-col items-center justify-center min-h-0 min-w-0"
        >
          <div className="flex-1" />
          {hasAnyElements ? (
            <div
              ref={previewRef}
              className="relative overflow-hidden border"
              style={{
                width: previewDimensions.width,
                height: previewDimensions.height,
                background:
                  activeProject?.backgroundType === "blur"
                    ? "transparent"
                    : activeProject?.backgroundColor || "#000000",
              }}
            >
              {renderBlurBackground()}
              {activeElements.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  No elements at current time
                </div>
              ) : (
                activeElements.map((elementData, index) =>
                  renderElement(elementData, index)
                )
              )}
              <LayoutGuideOverlay />
            </div>
          ) : null}

          <div className="flex-1" />

          <PreviewToolbar
            hasAnyElements={hasAnyElements}
            onToggleExpanded={toggleExpanded}
            isExpanded={isExpanded}
            currentTime={currentTime}
            setCurrentTime={setCurrentTime}
            toggle={toggle}
            getTotalDuration={getTotalDuration}
          />
        </div>
      </div>

      {isExpanded && (
        <FullscreenPreview
          previewDimensions={previewDimensions}
          activeProject={activeProject}
          renderBlurBackground={renderBlurBackground}
          activeElements={activeElements}
          renderElement={renderElement}
          blurBackgroundElements={blurBackgroundElements}
          hasAnyElements={hasAnyElements}
          toggleExpanded={toggleExpanded}
          currentTime={currentTime}
          setCurrentTime={setCurrentTime}
          toggle={toggle}
          getTotalDuration={getTotalDuration}
        />
      )}
    </>
  );
}

function FullscreenToolbar({
  hasAnyElements,
  onToggleExpanded,
  currentTime,
  setCurrentTime,
  toggle,
  getTotalDuration,
}: {
  hasAnyElements: boolean;
  onToggleExpanded: () => void;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  toggle: () => void;
  getTotalDuration: () => number;
}) {
  const { isPlaying, seek } = usePlaybackStore();
  const { activeProject } = useProjectStore();
  const [isDragging, setIsDragging] = useState(false);

  const totalDuration = getTotalDuration();
  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hasAnyElements) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * totalDuration;
    setCurrentTime(Math.max(0, Math.min(newTime, totalDuration)));
  };

  const handleTimelineDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hasAnyElements) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setIsDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const dragX = moveEvent.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, dragX / rect.width));
      const newTime = percentage * totalDuration;
      setCurrentTime(Math.max(0, Math.min(newTime, totalDuration)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
    };

    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    handleMouseMove(e.nativeEvent);
  };

  const skipBackward = () => {
    const newTime = Math.max(0, currentTime - 1);
    setCurrentTime(newTime);
  };

  const skipForward = () => {
    const newTime = Math.min(totalDuration, currentTime + 1);
    setCurrentTime(newTime);
  };

  return (
    <div
      data-toolbar
      className="flex items-center gap-2 p-1 pt-2 w-full text-foreground relative"
    >
      <div className="flex items-center gap-1 text-[0.70rem] tabular-nums text-foreground/90">
        <EditableTimecode
          time={currentTime}
          duration={totalDuration}
          format="HH:MM:SS:FF"
          fps={activeProject?.fps || DEFAULT_FPS}
          onTimeChange={seek}
          disabled={!hasAnyElements}
          className="text-foreground/90 hover:bg-white/10"
        />
        <span className="opacity-50">/</span>
        <span>
          {formatTimeCode(
            totalDuration,
            "HH:MM:SS:FF",
            activeProject?.fps || DEFAULT_FPS
          )}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="text"
          size="icon"
          onClick={skipBackward}
          disabled={!hasAnyElements}
          className="h-auto p-0 text-foreground"
          title="Skip backward 1s"
        >
          <SkipBack className="h-3 w-3" />
        </Button>
        <Button
          variant="text"
          size="icon"
          onClick={toggle}
          disabled={!hasAnyElements}
          className="h-auto p-0 text-foreground hover:text-foreground/80"
        >
          {isPlaying ? (
            <Pause className="h-3 w-3" />
          ) : (
            <Play className="h-3 w-3" />
          )}
        </Button>
        <Button
          variant="text"
          size="icon"
          onClick={skipForward}
          disabled={!hasAnyElements}
          className="h-auto p-0 text-foreground hover:text-foreground/80"
          title="Skip forward 1s"
        >
          <SkipForward className="h-3 w-3" />
        </Button>
      </div>

      <div className="flex-1 flex items-center gap-2">
        <div
          className={cn(
            "relative h-1 rounded-full cursor-pointer flex-1 bg-foreground/20",
            !hasAnyElements && "opacity-50 cursor-not-allowed"
          )}
          onClick={hasAnyElements ? handleTimelineClick : undefined}
          onMouseDown={hasAnyElements ? handleTimelineDrag : undefined}
          style={{ userSelect: "none" }}
        >
          <div
            className={cn(
              "absolute top-0 left-0 h-full rounded-full bg-foreground",
              !isDragging && "duration-100"
            )}
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 w-3 h-3 rounded-full -translate-y-1/2 -translate-x-1/2 shadow-xs bg-foreground border border-black/20"
            style={{ left: `${progress}%` }}
          />
        </div>
      </div>

      <Button
        variant="text"
        size="icon"
        className="size-4! text-foreground/80 hover:text-foreground"
        onClick={onToggleExpanded}
        title="Exit fullscreen (Esc)"
      >
        <Expand className="size-4!" />
      </Button>
    </div>
  );
}

function FullscreenPreview({
  previewDimensions,
  activeProject,
  renderBlurBackground,
  activeElements,
  renderElement,
  blurBackgroundElements,
  hasAnyElements,
  toggleExpanded,
  currentTime,
  setCurrentTime,
  toggle,
  getTotalDuration,
}: {
  previewDimensions: { width: number; height: number };
  activeProject: any;
  renderBlurBackground: () => React.ReactNode;
  activeElements: ActiveElement[];
  renderElement: (elementData: ActiveElement, index: number) => React.ReactNode;
  blurBackgroundElements: ActiveElement[];
  hasAnyElements: boolean;
  toggleExpanded: () => void;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  toggle: () => void;
  getTotalDuration: () => number;
}) {
  return (
    <div className="fixed inset-0 z-9999 flex flex-col">
      <div className="flex-1 flex items-center justify-center bg-background">
        <div
          className="relative overflow-hidden border border-border m-3"
          style={{
            width: previewDimensions.width,
            height: previewDimensions.height,
            background:
              activeProject?.backgroundType === "blur"
                ? "#1a1a1a"
                : activeProject?.backgroundColor || "#1a1a1a",
          }}
        >
          {renderBlurBackground()}
          {activeElements.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-white/60">
              No elements at current time
            </div>
          ) : (
            activeElements.map((elementData, index) =>
              renderElement(elementData, index)
            )
          )}
          <LayoutGuideOverlay />
        </div>
      </div>
      <div className="p-4 bg-background">
        <FullscreenToolbar
          hasAnyElements={hasAnyElements}
          onToggleExpanded={toggleExpanded}
          currentTime={currentTime}
          setCurrentTime={setCurrentTime}
          toggle={toggle}
          getTotalDuration={getTotalDuration}
        />
      </div>
    </div>
  );
}

function PreviewToolbar({
  hasAnyElements,
  onToggleExpanded,
  isExpanded,
  currentTime,
  setCurrentTime,
  toggle,
  getTotalDuration,
}: {
  hasAnyElements: boolean;
  onToggleExpanded: () => void;
  isExpanded: boolean;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  toggle: () => void;
  getTotalDuration: () => number;
}) {
  const { isPlaying } = usePlaybackStore();
  const { layoutGuide, toggleLayoutGuide } = useEditorStore();
  const { isSelectionMode, setSelectionMode } = useObjectSelectionStore();

  if (isExpanded) {
    return (
      <FullscreenToolbar
        {...{
          hasAnyElements,
          onToggleExpanded,
          currentTime,
          setCurrentTime,
          toggle,
          getTotalDuration,
        }}
      />
    );
  }

  return (
    <div
      data-toolbar
      className="flex justify-end gap-2 h-auto pb-5 pr-5 pt-4 w-full"
    >
      <div className="flex items-center gap-2">
        <Button
          variant="text"
          size="icon"
          onClick={toggle}
          disabled={!hasAnyElements}
          className="h-auto p-0"
        >
          {isPlaying ? (
            <Pause className="h-3 w-3" />
          ) : (
            <Play className="h-3 w-3" />
          )}
        </Button>
        
        {/* Object Selection Toggle */}
        <Button
          variant={isSelectionMode ? "default" : "text"}
          size="icon"
          onClick={() => setSelectionMode(!isSelectionMode)}
          disabled={!hasAnyElements}
          className="h-auto p-0"
          title={isSelectionMode ? "Exit object selection mode" : "Enter object selection mode"}
        >
          <Target className={cn("h-3 w-3", isSelectionMode && "text-white")} />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="text"
              size="icon"
              className="h-auto p-0 mr-1"
              title="Toggle layout guide"
            >
              <SocialsIcon className="!size-6" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="grid gap-4">
              <div className="space-y-2">
                <h4 className="font-medium leading-none">Layout guide</h4>
                <p className="text-sm text-muted-foreground">
                  Show platform-specific layout guides to help align your
                  content with interface elements like profile pictures,
                  usernames, and interaction buttons.
                </p>
              </div>
              <div className="grid gap-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="none"
                    checked={layoutGuide.platform === null}
                    onCheckedChange={() =>
                      toggleLayoutGuide(layoutGuide.platform || "tiktok")
                    }
                  />
                  <Label htmlFor="none">None</Label>
                </div>
                {Object.entries(PLATFORM_LAYOUTS).map(([platform, label]) => (
                  <div key={platform} className="flex items-center space-x-2">
                    <Checkbox
                      id={platform}
                      checked={layoutGuide.platform === platform}
                      onCheckedChange={() =>
                        toggleLayoutGuide(platform as PlatformLayout)
                      }
                    />
                    <Label htmlFor={platform}>{label}</Label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Button
          variant="text"
          size="icon"
          className="size-4!"
          onClick={onToggleExpanded}
          title="Enter fullscreen"
        >
          <Expand className="size-4!" />
        </Button>
      </div>
    </div>
  );
}
