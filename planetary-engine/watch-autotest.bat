@echo off
rem Fully automatic loop: whenever Claude pushes a new commit to the branch, pull it, run the autotest, push the results.
rem Leave this window open (a Minecraft window opens for ~1 minute per run, then closes itself). Stop with Ctrl+C.
rem SECURITY: this executes whatever code is on the branch - only use it while you trust everyone with push access to it.
cd /d "%~dp0"
set BRANCH=claude/planetary-engine-phase1
echo Watching origin/%BRANCH% every 60 s ...
:loop
git fetch origin %BRANCH% >nul 2>&1
for /f %%i in ('git rev-parse HEAD') do set LOCAL=%%i
for /f %%i in ('git rev-parse origin/%BRANCH%') do set REMOTE=%%i
if "%LOCAL%"=="%REMOTE%" goto wait
git log -1 --format=%%s origin/%BRANCH% > "%TEMP%\planetary-lastmsg.txt"
set /p MSG=<"%TEMP%\planetary-lastmsg.txt"
git pull --rebase origin %BRANCH%
echo %MSG% | findstr /b /c:"Autotest results" >nul && goto wait
echo New commit %REMOTE% (%MSG%) - running autotest ...
call run-autotest.bat
:wait
timeout /t 60 /nobreak >nul
goto loop
