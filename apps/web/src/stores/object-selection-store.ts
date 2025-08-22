import { create } from "zustand";
import { useTimelineStore } from "./timeline-store";
import type { CreateObjectElement } from "@/types/timeline";

export interface SegmentedObject {
  id: string;
  videoId: string;
  trackId: string;
  name: string;
  frames: number[];
  boundingBoxes: Array<{
    frame: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  maskUrl?: string; // URL to segmentation mask data
  confidence: number;
  createdAt: Date;
  status: "segmenting" | "tracking" | "ready" | "error";
}

export interface ClickCoordinate {
  x: number;
  y: number;
  timestamp: number;
  frame: number;
}

interface ObjectSelectionState {
  // Current selection state
  selectedObjects: SegmentedObject[];
  isSelectionMode: boolean;
  isProcessingSelection: boolean;
  
  // Click coordinates for segmentation
  pendingClick: ClickCoordinate | null;
  
  // Object data
  segmentedObjects: Map<string, SegmentedObject>; // key: objectId
  objectsByVideo: Map<string, string[]>; // key: videoId, value: objectIds
  
  // Actions
  setSelectionMode: (enabled: boolean) => void;
  addClickCoordinate: (click: ClickCoordinate, videoId: string) => void;
  clearPendingClick: () => void;
  setProcessingSelection: (processing: boolean) => void;
  
  // Object management
  addSegmentedObject: (object: SegmentedObject) => void;
  updateSegmentedObject: (objectId: string, updates: Partial<SegmentedObject>) => void;
  removeSegmentedObject: (objectId: string) => void;
  selectObject: (objectId: string) => void;
  deselectObject: (objectId: string) => void;
  clearSelection: () => void;
  
  // Timeline integration
  createObjectTimelineElement: (object: SegmentedObject) => CreateObjectElement;
  
  // Getters
  getObjectsByVideo: (videoId: string) => SegmentedObject[];
  getSelectedObject: () => SegmentedObject | null;
}

export const useObjectSelectionStore = create<ObjectSelectionState>((set, get) => ({
  // Initial state
  selectedObjects: [],
  isSelectionMode: false,
  isProcessingSelection: false,
  pendingClick: null,
  segmentedObjects: new Map(),
  objectsByVideo: new Map(),

  // Actions
  setSelectionMode: (enabled: boolean) => {
    set({ isSelectionMode: enabled });
    if (!enabled) {
      // Clear pending click and selection when disabling selection mode
      set({ pendingClick: null });
      get().clearSelection();
    }
  },

  addClickCoordinate: (click: ClickCoordinate, videoId: string) => {
    set({ 
      pendingClick: click,
      isProcessingSelection: true 
    });
  },

  clearPendingClick: () => {
    set({ pendingClick: null });
  },

  setProcessingSelection: (processing: boolean) => {
    set({ isProcessingSelection: processing });
  },

  addSegmentedObject: (object: SegmentedObject) => {
    const { segmentedObjects, objectsByVideo, createObjectTimelineElement } = get();
    
    // Add to objects map
    const newSegmentedObjects = new Map(segmentedObjects);
    newSegmentedObjects.set(object.id, object);
    
    // Add to video mapping
    const newObjectsByVideo = new Map(objectsByVideo);
    const videoObjects = newObjectsByVideo.get(object.videoId) || [];
    newObjectsByVideo.set(object.videoId, [...videoObjects, object.id]);
    
    set({ 
      segmentedObjects: newSegmentedObjects, 
      objectsByVideo: newObjectsByVideo 
    });
    
    // Create timeline element for this object
    const timelineElement = createObjectTimelineElement(object);
    
    // Add to timeline (create or find existing object track)
    try {
      const timelineStore = useTimelineStore.getState();
      let objectTrack = timelineStore.tracks.find(track => track.type === "object");
      
      if (!objectTrack) {
        // Create new object track
        timelineStore.addTrack("object");
        objectTrack = timelineStore.tracks.find(track => track.type === "object");
      }
      
      if (objectTrack) {
        timelineStore.addElementToTrack(objectTrack.id, timelineElement);
      }
    } catch (error) {
      console.error("Failed to create timeline element for object:", error);
    }
  },

  updateSegmentedObject: (objectId: string, updates: Partial<SegmentedObject>) => {
    const { segmentedObjects } = get();
    const object = segmentedObjects.get(objectId);
    
    if (object) {
      const updatedObject = { ...object, ...updates };
      const newSegmentedObjects = new Map(segmentedObjects);
      newSegmentedObjects.set(objectId, updatedObject);
      
      set({ segmentedObjects: newSegmentedObjects });
      
      // Update selected objects if this object is selected
      const { selectedObjects } = get();
      const selectedIndex = selectedObjects.findIndex(obj => obj.id === objectId);
      if (selectedIndex !== -1) {
        const newSelectedObjects = [...selectedObjects];
        newSelectedObjects[selectedIndex] = updatedObject;
        set({ selectedObjects: newSelectedObjects });
      }
    }
  },

  removeSegmentedObject: (objectId: string) => {
    const { segmentedObjects, objectsByVideo, selectedObjects } = get();
    const object = segmentedObjects.get(objectId);
    
    if (object) {
      // Remove from objects map
      const newSegmentedObjects = new Map(segmentedObjects);
      newSegmentedObjects.delete(objectId);
      
      // Remove from video mapping
      const newObjectsByVideo = new Map(objectsByVideo);
      const videoObjects = newObjectsByVideo.get(object.videoId) || [];
      newObjectsByVideo.set(
        object.videoId, 
        videoObjects.filter(id => id !== objectId)
      );
      
      // Remove from selection
      const newSelectedObjects = selectedObjects.filter(obj => obj.id !== objectId);
      
      set({ 
        segmentedObjects: newSegmentedObjects,
        objectsByVideo: newObjectsByVideo,
        selectedObjects: newSelectedObjects
      });
    }
  },

  selectObject: (objectId: string) => {
    const { segmentedObjects, selectedObjects } = get();
    const object = segmentedObjects.get(objectId);
    
    if (object && !selectedObjects.some(obj => obj.id === objectId)) {
      set({ selectedObjects: [...selectedObjects, object] });
    }
  },

  deselectObject: (objectId: string) => {
    const { selectedObjects } = get();
    set({ selectedObjects: selectedObjects.filter(obj => obj.id !== objectId) });
  },

  clearSelection: () => {
    set({ selectedObjects: [] });
  },

  // Timeline integration
  createObjectTimelineElement: (object: SegmentedObject) => {
    // Calculate duration based on object frame range
    const startFrame = Math.min(...object.frames);
    const endFrame = Math.max(...object.frames);
    const fps = 30; // Default FPS, should ideally come from video metadata
    const duration = (endFrame - startFrame + 1) / fps;
    const startTime = startFrame / fps;
    
    const timelineElement: CreateObjectElement = {
      type: "object",
      name: object.name,
      objectId: object.id,
      videoId: object.videoId,
      confidence: object.confidence,
      visible: true,
      operation: null,
      operationParams: {},
      duration: Math.max(duration, 0.1), // Minimum 0.1 second duration
      startTime: startTime,
      trimStart: 0,
      trimEnd: 0,
    };
    
    return timelineElement;
  },

  // Getters
  getObjectsByVideo: (videoId: string) => {
    const { segmentedObjects, objectsByVideo } = get();
    const objectIds = objectsByVideo.get(videoId) || [];
    return objectIds
      .map(id => segmentedObjects.get(id))
      .filter((obj): obj is SegmentedObject => obj !== undefined);
  },

  getSelectedObject: () => {
    const { selectedObjects } = get();
    return selectedObjects.length > 0 ? selectedObjects[0] : null;
  },
}));