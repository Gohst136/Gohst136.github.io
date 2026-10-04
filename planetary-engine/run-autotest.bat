@echo off
rem Runs the planetary descent autotest on this PC and pushes the results (stats + screenshots) to git.
rem Needs: JDK 21 on PATH, git with push access. Run from the planetary-engine folder.
cd /d "%~dp0"
call gradlew.bat -PwithMod=true -Pautotest :mod:runClient || goto :eof
if exist autotest-results rmdir /s /q autotest-results
xcopy /e /i /y mod\run\planetary-autotest autotest-results >nul
git add autotest-results
git commit -m "Autotest results from local GPU"
git push
echo Done - results pushed. Tell Claude to continue.
