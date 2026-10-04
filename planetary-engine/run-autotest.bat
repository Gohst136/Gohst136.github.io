@echo off
rem Runs the planetary descent autotest on this PC and pushes the results (stats + screenshots + log) to git.
rem Pushes whatever exists even if the game crashed or hung (the in-game watchdog exits it), so a result is never silent.
cd /d "%~dp0"
set CODE=
for /f "tokens=1,* delims= " %%a in ('git log HEAD -30 "--format=%%H %%s"') do (
  echo %%b | findstr /b /c:"Autotest results" >nul || (if not defined CODE set CODE=%%a)
)
if exist mod\run\planetary-autotest rmdir /s /q mod\run\planetary-autotest
call gradlew.bat -PwithMod=true -Pautotest :mod:runClient
if exist autotest-results rmdir /s /q autotest-results
mkdir autotest-results
if exist mod\run\planetary-autotest xcopy /e /i /y mod\run\planetary-autotest autotest-results >nul
copy /y mod\run\logs\latest.log autotest-results\latest.log >nul
if exist mod\run\crash-reports xcopy /e /i /y mod\run\crash-reports autotest-results\crash-reports >nul
echo %CODE%> autotest-results\tested-commit.txt
git add autotest-results
git commit -m "Autotest results from local GPU"
git push || (git pull --rebase && git push)
echo Done - results pushed.
