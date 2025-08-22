### Phase 1: Foundational Layers (Video Ingestion, Segmentation & Scene Representation)

1.  **Video Ingestion & Project Creation**
    *   **OpenCut Interface:** Enhance the "New Project" flow to support video uploads. The uploaded video will be displayed in the `MediaPanel`.
    *   **`ingest-api` (New Microservice):** A FastAPI service to handle video uploads, store them in GCS, and create a new project in the database.

2.  **Object Segmentation & Tracking**
    *   **OpenCut Interface:** Enable a "click-to-select" interaction in the `PreviewPanel`. When a user clicks on an object in the video, the coordinates will be sent to the backend, and the resulting segmentation mask will be displayed as an overlay.
    *   **`segmentation-api` (New Microservice):** A FastAPI service with a Python worker that uses SAM 2 to perform object segmentation and tracking. The resulting masks will be stored in GCS.

3.  **Scene Graph Visualization**
    *   **OpenCut Interface:** Introduce new tracks in the `Timeline` to represent each segmented object. The `PropertiesPanel` will display information about the selected object.
    *   **`scene-graph-api` (New Microservice):** A FastAPI service to provide the frontend with the semantic scene graph data for a project.

### Phase 2: Manipulation & Editing

4.  **Object Removal**
    *   **OpenCut Interface:** Add a "Delete" button to the `PropertiesPanel` for a selected object.
    *   **`edit-api` (New Microservice):** A FastAPI service with a worker that uses inpainting models to remove the selected object from the video.

5.  **Object Repositioning**
    *   **OpenCut Interface:** Allow users to drag and drop segmented objects within the `PreviewPanel`.
    *   **`edit-api` (Enhancement):** Extend the `edit-api` to handle object repositioning, using optical flow and inpainting to create the desired output.
