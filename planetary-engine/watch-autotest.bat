@echo off
rem Fully automatic loop: whenever Claude pushes a new CODE commit to the branch, pull it, run the autotest, push the results.
rem Compares the newest non-results commit on origin with the one recorded in autotest-results\tested-commit.txt, so the
rem order of commits does not matter. Leave this window open (a Minecraft window opens for ~2 minutes per run and closes
rem itself). Stop with Ctrl+C.
rem SECURITY: this executes whatever code is on the branch - only use it while you trust everyone with push access to it.
cd /d "%~dp0"
set BRANCH=claude/planetary-engine-phase1
echo Watching origin/%BRANCH% every 60 s ...
:loop
git fetch origin %BRANCH% >nul 2>&1
git pull --rebase origin %BRANCH% >nul 2>&1
set WANT=
for /f "tokens=1,* delims= " %%a in ('git log origin/%BRANCH% -30 "--format=%%H %%s"') do (
  echo %%b | findstr /b /c:"Autotest results" >nul || (if not defined WANT set WANT=%%a)
)
set HAVE=none
if exist autotest-results\tested-commit.txt set /p HAVE=<autotest-results\tested-commit.txt
if "%WANT%"=="%HAVE%" goto wait
echo New code commit %WANT% (tested: %HAVE%) - running autotest ...
call run-autotest.bat
:wait
timeout /t 60 /nobreak >nul
goto loop
