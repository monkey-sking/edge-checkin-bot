@echo off
chcp 65001 >nul
cd /d "C:\Users\Administrator\edge-checkin-bot"
echo 正在签到，请稍候...
echo.
"D:\nodejs\node-v24.15.0-win-x64\node.exe" checkin.js
echo.
echo ============ 签到完成，按任意键关闭 ============
pause >nul
