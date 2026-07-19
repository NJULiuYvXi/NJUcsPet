@echo off
cd /d "%~dp0"
if not exist node_modules\electron\dist\electron.exe (
  echo First run: installing dependencies...
  call npm install
  if errorlevel 1 pause & exit /b 1
)
call npm start
