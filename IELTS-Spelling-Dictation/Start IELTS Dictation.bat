@echo off
rem Opens IELTS Spelling Dictation in Microsoft Edge (or Chrome). Nothing is installed.
set "APP=%~dp0IELTS-Spelling-Dictation.html"
for %%B in (
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do (
  if exist %%B (
    start "" %%B "%APP%"
    exit /b 0
  )
)
rem Neither Edge nor Chrome found: open with the default browser.
start "" "%APP%"
