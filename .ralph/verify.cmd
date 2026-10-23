@echo off
REM AnimalChess 验收入口（本机 PATH 无 node，故用绝对路径）
"C:\Users\hohox\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" "%~dp0verify.mjs" %*
exit /b %ERRORLEVEL%
