from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime

class Detection(BaseModel):
    track_id: int
    class_name: str
    confidence: float
    bbox: List[int]  # [x1, y1, x2, y2]
    contaminated: bool = False

class FrameData(BaseModel):
    frame_b64: Optional[str] = None
    tracks: List[Detection] = []
    humans: List[Detection] = []
    fps: float = 0
    frame_w: int = 640
    frame_h: int = 480
    recording: bool = False
    rec_time: int = 0
    bin_status: Dict = {"fill_pct": 0, "status": "OK"}
    bin_counts: Dict[str, int] = {}

class AuditEvent(BaseModel):
    id: Optional[str] = None
    timestamp: datetime
    track_id: int
    class_name: str
    confidence: float
    contaminated: bool
    frame_number: int

class Alert(BaseModel):
    id: Optional[str] = None
    timestamp: datetime
    alert_type: str  # "CONTAMINATION" or "OVERFLOW"
    severity: str     # "INFO", "WARNING", "CRITICAL"
    detail: str
    acknowledged: bool = False

class Recording(BaseModel):
    id: Optional[str] = None
    session_id: str
    filename: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_sec: int = 0
    total_items: int = 0
    had_overflow: bool = False

class Summary(BaseModel):
    class_counts: Dict[str, int] = {}
    contaminated_total: int = 0
    latest_bin: Dict = {}
    total_recordings: int = 0

class HealthResponse(BaseModel):
    status: str
    fps: float
    camera_active: bool
    model_loaded: bool
    mongodb_connected: bool

class ConfigUpdate(BaseModel):
    confidence_threshold: Optional[float] = None
    bin_warning_threshold: Optional[float] = None
    bin_full_threshold: Optional[float] = None
    face_blur_enabled: Optional[bool] = None