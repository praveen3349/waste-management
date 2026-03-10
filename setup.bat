@echo off
echo ========================================
echo    ECO-SIGHT Setup Script (Windows)
echo ========================================
echo.

echo Installing Python dependencies...
cd backend
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo Failed to install Python dependencies
    pause
    exit /b %errorlevel%
)
cd ..

echo.
echo Installing Node.js dependencies...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo Failed to install Node.js dependencies
    pause
    exit /b %errorlevel%
)
cd ..

echo.
echo ✅ Setup complete!
echo.
echo To run the application:
echo 1. Update backend/.env with your MongoDB connection string
echo 2. Run run.bat to start both servers
pause