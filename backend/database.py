from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME", "ecosight_db")

class MongoDB:
    client: AsyncIOMotorClient = None
    database = None

db = MongoDB()

async def connect_to_mongo():
    """Connect to MongoDB Atlas"""
    try:
        if not MONGODB_URL:
            print("⚠️  MONGODB_URL not set, running without database")
            return
            
        db.client = AsyncIOMotorClient(MONGODB_URL)
        db.database = db.client[DATABASE_NAME]
        await db.client.admin.command('ping')
        print("✅ Connected to MongoDB Atlas")
        
        # Create indexes
        await db.database.audit.create_index("timestamp")
        await db.database.alerts.create_index([("timestamp", -1)])
        await db.database.recordings.create_index("session_id")
        
    except Exception as e:
        print(f"❌ MongoDB connection error: {e}")
        print("⚠️  Continuing without database connection...")

async def close_mongo_connection():
    if db.client:
        db.client.close()
        print("Disconnected from MongoDB")

async def save_audit_event(event: dict):
    if not db.database:
        return None
    collection = db.database["audit"]
    return await collection.insert_one(event)

async def save_alert(alert: dict):
    if not db.database:
        return None
    collection = db.database["alerts"]
    return await collection.insert_one(alert)

async def save_recording(recording: dict):
    if not db.database:
        return None
    collection = db.database["recordings"]
    return await collection.insert_one(recording)

async def get_recent_audit(limit: int = 200):
    if not db.database:
        return []
    collection = db.database["audit"]
    cursor = collection.find().sort("timestamp", -1).limit(limit)
    return await cursor.to_list(length=limit)

async def get_alerts(limit: int = 50):
    if not db.database:
        return []
    collection = db.database["alerts"]
    cursor = collection.find().sort("timestamp", -1).limit(limit)
    return await cursor.to_list(length=limit)

async def get_recordings(limit: int = 20):
    if not db.database:
        return []
    collection = db.database["recordings"]
    cursor = collection.find().sort("started_at", -1).limit(limit)
    return await cursor.to_list(length=limit)

async def acknowledge_alert(alert_id: str):
    if not db.database:
        return None
    collection = db.database["alerts"]
    return await collection.update_one(
        {"_id": alert_id},
        {"$set": {"acknowledged": True}}
    )