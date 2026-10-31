@echo off
chcp 65001 >nul
title 出海宝 - 本地LLM代理
cd /d "%~dp0"

echo.
echo ==========================================
echo   出海宝 本地 LLM 代理启动器
echo ==========================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [错误] 没找到 python，请先安装 Python 3 并勾选 "Add to PATH"。
    echo        或者把下面的 python 换成完整路径。
    pause
    exit /b 1
)

echo 正在启动代理...
echo 提示：保持本窗口开启，关闭即停止代理。
echo 按 Ctrl+C 可停止。
echo.
python proxy.py

echo.
echo 代理已停止。
pause
