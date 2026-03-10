# app.py - Complete ECO-SIGHT Backend with all API endpoints
import os
import time
import uuid
import base64
import asyncio
from datetime import datetime
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import aiofiles

# ============================================================================
# LOAD MODELS - EXACTLY LIKE YOUR WORKING STREAMLIT CODE
# ============================================================================
print("=" * 60)
print("ECO-SIGHT Backend - Initializing")
print("=" * 60)

# Load YOLO model - SAME as Streamlit
try:
    from ultralytics import YOLO
    print("Loading YOLO model...")
    model = YOLO("yolov8n.pt")
    print("✅ Model loaded successfully")
    MODEL_LOADED = True
except Exception as e:
    print(f"❌ Model loading failed: {e}")
    print("⚠️ Using mock mode")
    model = None
    MODEL_LOADED = False

# Load face detector
print("\nLoading face cascade...")
face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)
if not face_cascade.empty():
    print("✅ Face cascade loaded")
else:
    print("⚠️ Face cascade loading failed")

# ============================================================================
# APPLICATION STATE
# ============================================================================
class AppState:
    def __init__(self):
        # Camera state
        self.camera = None
        self.camera_active = False
        self.frame_count = 0
        self.fps = 0
        self.last_fps_update = time.time()
        self.latest_frame = None
        
        # Detection settings
        self.blur_faces = False
        self.confidence_threshold = 0.45
        
        # Detection counts
        self.detections_count = 0
        self.class_counts = {}
        self.contaminated_count = 0
        
        # Bin status
        self.bin_status = {"fill_pct": 0, "status": "OK"}
        
        # Recording state
        self.recording = False
        self.current_recording = None
        
        # Alerts
        self.alerts = []  # Store alerts in memory

state = AppState()

# ============================================================================
# COCO TO WASTE MAPPING
# ============================================================================
WASTE_MAPPING = {
    # Plastics
    "bottle": "Plastic",
    "cup": "Plastic",
    "bowl": "Plastic",
    "plastic": "Plastic",
    "bucket": "Plastic",
    "toy": "Plastic",
    
    # Metals
    "fork": "Metal",
    "knife": "Metal",
    "spoon": "Metal",
    "can": "Metal",
    "tin": "Metal",
    
    # Glass
    "wine glass": "Glass",
    "glass": "Glass",
    "jar": "Glass",
    
    # Paper
    "book": "Paper",
    "paper": "Paper",
    "newspaper": "Paper",
    "magazine": "Paper",
    "cardboard": "Paper",
    
    # E-Waste
    "cell phone": "E-Waste",
    "laptop": "E-Waste",
    "tv": "E-Waste",
    "remote": "E-Waste",
    "keyboard": "E-Waste",
    "mouse": "E-Waste",
    
    # Bio-Hazard (organic waste)
    "banana": "Bio-Hazard",
    "apple": "Bio-Hazard",
    "orange": "Bio-Hazard",
    "broccoli": "Bio-Hazard",
    "carrot": "Bio-Hazard",
    "hot dog": "Bio-Hazard",
    "pizza": "Bio-Hazard",
    "donut": "Bio-Hazard",
    "cake": "Bio-Hazard",
    "sandwich": "Bio-Hazard",
    "food": "Bio-Hazard",
    
    # Default
    "person": "person",
}

def map_to_waste_class(coco_class: str) -> str:
    """Map COCO class to waste category"""
    return WASTE_MAPPING.get(coco_class.lower(), "Mixed Waste")

# ============================================================================
# FRAME PROCESSING - EXACTLY LIKE YOUR STREAMLIT CODE
# ============================================================================
def process_frame(frame):
    """Process frame exactly like your Streamlit code"""
    
    detections = []
    
    if MODEL_LOADED and model is not None:
        # Use YOLO model
        results = model(frame, conf=state.confidence_threshold)
        
        for box in results[0].boxes:
            cls = int(box.cls[0])
            coco_class = model.names[cls]
            label = map_to_waste_class(coco_class)
            confidence = float(box.conf[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            
            # Generate track ID
            track_id = hash(f"{cls}_{x1}_{y1}") % 10000
            
            # Draw bounding box
            color_map = {
                "Plastic": (0, 255, 0),
                "Metal": (255, 165, 0),
                "Glass": (128, 0, 128),
                "Paper": (255, 255, 0),
                "Bio-Hazard": (255, 0, 0),
                "E-Waste": (255, 192, 203),
            }
            color = color_map.get(label, (0, 255, 0))
            
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, f"{label} {confidence:.2f}", (x1, y1-5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
            
            # Blur faces if enabled - EXACT same as Streamlit
            if coco_class == "person" and state.blur_faces and face_cascade is not None:
                roi = frame[y1:y2, x1:x2]
                gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
                faces = face_cascade.detectMultiScale(gray, 1.3, 5)
                
                for (fx, fy, fw, fh) in faces:
                    face = roi[fy:fy+fh, fx:fx+fw]
                    blur = cv2.GaussianBlur(face, (99, 99), 30)
                    roi[fy:fy+fh, fx:fx+fw] = blur
                
                frame[y1:y2, x1:x2] = roi
            
            # Random contamination (simulated)
            contaminated = np.random.random() < 0.05 and label != "person"
            if contaminated:
                cv2.putText(frame, "⚠️ CONTAMINATED", (x1, y2+15),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
                state.contaminated_count += 1
            
            detection = {
                "track_id": track_id,
                "class_name": label,
                "confidence": confidence,
                "bbox": [x1, y1, x2-x1, y2-y1],
                "contaminated": contaminated
            }
            detections.append(detection)
            
            # Update class counts
            if label != "person":
                state.class_counts[label] = state.class_counts.get(label, 0) + 1
                state.detections_count += 1
    else:
        # Mock mode for testing
        h, w = frame.shape[:2]
        num_detections = np.random.randint(0, 5)
        
        for i in range(num_detections):
            x1 = np.random.randint(0, w-100)
            y1 = np.random.randint(0, h-100)
            x2 = x1 + np.random.randint(50, 150)
            y2 = y1 + np.random.randint(50, 150)
            
            classes = ["Plastic", "Metal", "Glass", "Paper", "Bio-Hazard"]
            label = np.random.choice(classes)
            confidence = np.random.uniform(0.6, 0.95)
            contaminated = np.random.random() < 0.1
            
            color_map = {
                "Plastic": (0, 255, 0),
                "Metal": (255, 165, 0),
                "Glass": (128, 0, 128),
                "Paper": (255, 255, 0),
                "Bio-Hazard": (255, 0, 0),
            }
            color = color_map.get(label, (0, 255, 0))
            
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, f"{label} {confidence:.2f}", (x1, y1-5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
            
            detection = {
                "track_id": hash(f"{label}_{i}") % 10000,
                "class_name": label,
                "confidence": confidence,
                "bbox": [x1, y1, x2-x1, y2-y1],
                "contaminated": contaminated
            }
            detections.append(detection)
            
            state.class_counts[label] = state.class_counts.get(label, 0) + 1
            state.detections_count += 1
            if contaminated:
                state.contaminated_count += 1
    
    # Update bin status based on total items
    total_items = sum(state.class_counts.values())
    state.bin_status["fill_pct"] = min(100, (total_items % 100) * 1.5)
    
    if state.bin_status["fill_pct"] >= 85:
        state.bin_status["status"] = "OVERFLOW"
        # Create alert if not already alerted
        if not any(a['type'] == 'OVERFLOW' for a in state.alerts[-5:]):
            state.alerts.append({
                "id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                "type": "OVERFLOW",
                "severity": "CRITICAL",
                "detail": f"Bin at {state.bin_status['fill_pct']:.0f}% capacity",
                "acknowledged": False
            })
    elif state.bin_status["fill_pct"] >= 60:
        state.bin_status["status"] = "WARNING"
    else:
        state.bin_status["status"] = "OK"
    
    return frame, detections

# ============================================================================
# CAMERA LOOP
# ============================================================================
async def camera_loop():
    """Background camera capture - runs continuously"""
    print("\nStarting camera loop...")
    state.camera = cv2.VideoCapture(0)
    
    if not state.camera.isOpened():
        print("❌ Could not open camera")
        state.camera_active = False
        return
    
    print("✅ Camera opened successfully")
    state.camera_active = True
    
    while True:
        try:
            ret, frame = state.camera.read()
            if not ret:
                await asyncio.sleep(0.1)
                continue
            
            # Process frame
            processed, detections = process_frame(frame)
            
            # Update FPS
            state.frame_count += 1
            current_time = time.time()
            if current_time - state.last_fps_update >= 1.0:
                state.fps = state.frame_count
                state.frame_count = 0
                state.last_fps_update = current_time
                print(f"📊 FPS: {state.fps}, Detections: {len(detections)}")
            
            # Separate humans from waste
            waste_tracks = [d for d in detections if d["class_name"] != "person"]
            humans = [d for d in detections if d["class_name"] == "person"]
            
            # Encode for WebSocket
            _, buffer = cv2.imencode('.jpg', processed)
            frame_b64 = base64.b64encode(buffer).decode('utf-8')
            
            state.latest_frame = {
                "frame_b64": frame_b64,
                "tracks": waste_tracks,
                "humans": humans,
                "fps": state.fps,
                "frame_w": frame.shape[1],
                "frame_h": frame.shape[0],
                "recording": state.recording,
                "rec_time": int(time.time() - state.current_recording["started_at"].timestamp()) if state.recording and state.current_recording else 0,
                "bin_status": state.bin_status,
                "bin_counts": state.class_counts
            }
            
            # Handle recording
            if state.recording and state.current_recording:
                state.current_recording["frames"].append(frame_b64)
                state.current_recording["total_items"] += len(detections)
            
            await asyncio.sleep(0.03)  # ~30 FPS
            
        except Exception as e:
            print(f"Camera loop error: {e}")
            await asyncio.sleep(1)

# ============================================================================
# FASTAPI APP
# ============================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("\n" + "=" * 60)
    print("Starting ECO-SIGHT backend server...")
    asyncio.create_task(camera_loop())
    yield
    # Shutdown
    print("\nShutting down...")
    if state.camera:
        state.camera.release()

app = FastAPI(
    title="ECO-SIGHT API",
    description="Smart Waste Management System",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint - API info"""
    return {
        "name": "ECO-SIGHT API",
        "version": "1.0.0",
        "status": "running",
        "model_loaded": MODEL_LOADED,
        "camera_active": state.camera_active
    }

@app.get("/api/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "fps": state.fps,
        "camera_active": state.camera_active,
        "model_loaded": MODEL_LOADED,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.websocket("/ws/feed")
async def websocket_feed(websocket: WebSocket):
    """WebSocket endpoint for live video feed"""
    await websocket.accept()
    client_id = str(uuid.uuid4())[:8]
    print(f"🔌 WebSocket client {client_id} connected")
    
    try:
        while True:
            if state.latest_frame:
                await websocket.send_json(state.latest_frame)
            await asyncio.sleep(0.03)
    except Exception as e:
        print(f"🔌 WebSocket client {client_id} disconnected: {e}")
    finally:
        try:
            await websocket.close()
        except:
            pass

@app.post("/api/blur/{enabled}")
async def set_blur(enabled: bool):
    """Enable/disable face blurring"""
    state.blur_faces = enabled
    return {"blur": enabled}

@app.get("/api/summary")
async def get_summary():
    """Get summary statistics"""
    return {
        "class_counts": state.class_counts,
        "contaminated_total": state.contaminated_count,
        "latest_bin": state.bin_status,
        "total_detections": state.detections_count
    }

@app.get("/api/alerts")
async def get_alerts(limit: int = 50):
    """Get recent alerts"""
    # Return last 'limit' alerts
    return state.alerts[-limit:]

@app.post("/api/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str):
    """Acknowledge an alert"""
    for alert in state.alerts:
        if alert["id"] == alert_id:
            alert["acknowledged"] = True
            return {"status": "acknowledged", "alert": alert}
    raise HTTPException(status_code=404, detail="Alert not found")

@app.get("/api/audit")
async def get_audit(limit: int = 200):
    """Get recent audit events"""
    # Generate mock audit data
    audit_events = []
    classes = ["Plastic", "Metal", "Glass", "Paper", "Bio-Hazard", "E-Waste"]
    
    for i in range(min(limit, 50)):
        audit_events.append({
            "id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat(),
            "track_id": hash(f"track_{i}") % 10000,
            "class_name": np.random.choice(classes),
            "confidence": np.random.uniform(0.6, 0.95),
            "contaminated": np.random.random() < 0.1,
            "frame_number": i * 30
        })
    
    return sorted(audit_events, key=lambda x: x["timestamp"], reverse=True)

@app.post("/api/record/start")
async def start_recording():
    """Start recording the current session"""
    if not state.recording:
        state.recording = True
        state.current_recording = {
            "id": str(uuid.uuid4()),
            "session_id": str(uuid.uuid4()),
            "started_at": datetime.utcnow(),
            "frames": [],
            "total_items": 0
        }
        print("⏺ Recording started")
    return {"status": "recording_started"}

@app.post("/api/record/stop")
async def stop_recording():
    """Stop recording and save the session"""
    if state.recording and state.current_recording:
        state.recording = False
        duration = int(time.time() - state.current_recording["started_at"].timestamp())
        
        print(f"⏹ Recording stopped - duration: {duration}s, items: {state.current_recording['total_items']}")
        
        # Create recording record
        recording = {
            "id": state.current_recording["id"],
            "session_id": state.current_recording["session_id"],
            "filename": f"recording_{state.current_recording['started_at'].strftime('%Y%m%d_%H%M%S')}.mp4",
            "started_at": state.current_recording["started_at"].isoformat(),
            "ended_at": datetime.utcnow().isoformat(),
            "duration_sec": duration,
            "total_items": state.current_recording["total_items"],
            "had_overflow": state.bin_status["status"] == "OVERFLOW"
        }
        
        # In a real app, you'd save this to a database
        if not hasattr(state, 'recordings'):
            state.recordings = []
        state.recordings.append(recording)
        
        return {"status": "recording_stopped", "recording": recording}
    
    return {"status": "no_recording"}

@app.get("/api/recordings")
async def get_recordings(limit: int = 20):
    """Get list of recordings"""
    if hasattr(state, 'recordings'):
        return state.recordings[-limit:]
    return []

@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    """Upload and analyze a video file"""
    temp_path = f"temp_{uuid.uuid4()}.mp4"
    
    try:
        print(f"📁 Processing uploaded video: {file.filename}")
        
        # Save uploaded file
        async with aiofiles.open(temp_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        # Process video
        cap = cv2.VideoCapture(temp_path)
        class_counts = {}
        contaminated = 0
        peak_fill = 0
        overflow = False
        frame_count = 0
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_count += 1
            _, detections = process_frame(frame)
            
            for d in detections:
                if d["class_name"] != "person":
                    if not d["contaminated"]:
                        class_counts[d["class_name"]] = class_counts.get(d["class_name"], 0) + 1
                    else:
                        contaminated += 1
            
            # Simulate bin fill
            fill = (frame_count % 200) * 0.5
            peak_fill = max(peak_fill, min(100, fill))
            overflow = overflow or fill >= 85
        
        cap.release()
        
        # Calculate duration (assuming ~30 FPS)
        duration_sec = frame_count // 30
        
        print(f"✅ Video processed: {frame_count} frames, {sum(class_counts.values())} items detected")
        
        return {
            "class_counts": class_counts,
            "contaminated": contaminated,
            "peak_fill": peak_fill,
            "overflow": overflow,
            "duration_sec": duration_sec
        }
        
    except Exception as e:
        print(f"❌ Error processing video: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "detail": "Video processing failed"}
        )
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.get("/api/config")
async def get_config():
    """Get current configuration"""
    return {
        "confidence_threshold": state.confidence_threshold,
        "blur_faces": state.blur_faces,
        "bin_warning_threshold": 0.6,
        "bin_full_threshold": 0.85
    }

@app.post("/api/config")
async def update_config(config: dict):
    """Update configuration"""
    if "confidence_threshold" in config:
        state.confidence_threshold = float(config["confidence_threshold"])
    if "blur_faces" in config:
        state.blur_faces = bool(config["blur_faces"])
    
    print(f"⚙️ Config updated: {state.confidence_threshold=}, {state.blur_faces=}")
    return await get_config()

# ============================================================================
# MAIN ENTRY POINT
# ============================================================================
if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("🚀 ECO-SIGHT Backend Server")
    print("=" * 60)
    print(f"🌐 http://localhost:8000")
    print(f"📚 API docs: http://localhost:8000/docs")
    print(f"🔌 WebSocket: ws://localhost:8000/ws/feed")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8000)