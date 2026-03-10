import os
from dotenv import load_dotenv

load_dotenv()

# MongoDB Configuration
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb+srv://praveen3349db_user:wdmL1ECPELmUMHKO@ecosightdb.bpcjr6q.mongodb.net/?appName=ecosightdb")
DATABASE_NAME = os.getenv("DATABASE_NAME", "ecosight_db")

# Model Configuration
YOLO_MODEL = "yolov8n.pt"
CONFIDENCE_THRESHOLD = 0.45
FACE_BLUR_ENABLED = True

# Camera Configuration
CAMERA_SOURCE = 0  # 0 for default webcam, or path to video file
FRAME_WIDTH = 640
FRAME_HEIGHT = 480
FPS_LIMIT = 30

# Bin Thresholds
BIN_WARNING_THRESHOLD = 0.60  # 60%
BIN_FULL_THRESHOLD = 0.85      # 85%

# Paths
RECORDINGS_PATH = "recordings"
os.makedirs(RECORDINGS_PATH, exist_ok=True)