@echo off
title Poker App - Public Access
echo Starting Poker App public access...
echo Please wait. This window will display your friends' link.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\share-online.ps1"
pause
