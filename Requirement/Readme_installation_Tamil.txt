======================================================
 CHIT FUND APPLICATION - புதிய கணினி INSTALLATION GUIDE
 (Tamil - Client Use)
======================================================

இந்த file என்ன?
------------------
இந்த Readme file, புதிய Windows computer ஒரு system-ல
இந்த chit fund application-ஐ set up பண்ணுற basic steps-ஐ
சுலபமா தமிழில explain பண்ணுது.

முக்கியம்:
- இந்த folder: D:\chit fund\
- Requirement folder உள்ள software-களைப் பயன்படுத்தி
  Python, Node.js, Git, VS Code போன்றவை install பண்ணலாம்.


Step 1: தேவையான software-கள்
-----------------------------
இந்த application work ஆக Python + Node.js அவசியம்.

Requirement folder-ல இருக்கும் files:

1) Python
   Path: D:\chit fund\Requirement\Python\
   File: python-3.13.12-amd64.exe

   Install செய்யும்போது:
   - "Add Python to PATH" என்ற option-ஐ கீழே tick பண்ணணும்.
   - பிறகு "Install Now" press பண்ணுங்க.

2) Node.js (npm உடன் வரும்)
   Path: D:\chit fund\Requirement\Node\
   File: node-v24.13.1-x64.msi

   - File double-click → Next, Next → Install.

3) DB Browser for SQLite (optional, technician use)
   Path: D:\chit fund\Requirement\Tools\
   File: DB.Browser.for.SQLite-v3.13.1-win64.msi

   - இது database பார்க்கவேண்டிய நேரத்துக்கு மட்டும்.

4) VS Code (developer machine-க்கு மட்டும்)
   Path: D:\chit fund\Requirement\Editors\
   File: VSCodeSetup-x64.exe

   - Code edit / log check / debugging க்கு பயன்படுத்தலாம்.

5) Git (code update pull செய்ய வேண்டிய system-களுக்கு மட்டும்)
   Path: D:\chit fund\Requirement\Git\
   File: Git-64-bit.exe

   - Project update (developer மட்டும்) பயன்படும்.


Step 2: Project folder copy/check
----------------------------------
இந்த path சரியா இருப்பதைச் சரிபார்க்கவும்:

  D:\chit fund\

அதுக்குள்ள:
  - backend\
  - frontend\
  - start_servers.bat
  - start_app.vbs
  - finance.db (database file, தேவைக்கு ஏற்ப copy)

இதே structure புதிய computer-ல இருக்கணும்.


Step 3: Backend dependencies (ஒரு தடவை மட்டும்)
-----------------------------------------------
1) Windows Start → "PowerShell" open பண்ணுங்க.
2) கீழே உள்ள command type பண்ணி Enter press பண்ணுங்க:

   cd "D:\chit fund\backend"
   pip install -r requirements.txt

இது internet தேவைப்படலாம் (packages download ஆகும்).
இதைக் ஒரு தடவை மட்டும் செய்தாலே போதும்.


Step 4: Frontend dependencies (ஒரு தடவை மட்டும்)
------------------------------------------------
அதே PowerShell-ல் அல்லது புதியது open பண்ணி:

   cd "D:\chit fund\frontend"
   npm install

இது Node.js packages (Vite, React etc.) install பண்ணும்.
இந்த step-மும் ஒரு தடவை மட்டும்.


Step 5: Application start (daily use) - Recommended
---------------------------------------------------
அனைத்து software + dependencies install ஆயிட்ட பிறகு,
ஒவ்வொரு நாளும் app start செய்யவேண்டிய மிக சுலபமான வழி:

1) File Explorer open:
   D:\chit fund\start_app.vbs

2) அந்த file-ஐ double-click பண்ணுங்க.

இது என்ன செய்யும்?
- Backend server (Python + uvicorn) start ஆகும்.
- Frontend dev server (npm run dev - port 5173) start ஆகும்.
- சில seconds கழித்து browser-ல்:
    http://localhost:5173
  என்ற address open ஆகும்.

Customer-க்கு black colour command prompt window தெரியாது;
browser மட்டும் தெரியும்.


Step 6: License + initial setup (first time only)
-------------------------------------------------
1) Browser-ல் app open ஆனவுடன்:
   - F9 press → Developer login screen open ஆகும்.
   - Username: developer
   - Password: dev123 (fresh DB என்றால்).

2) Developer Dashboard-ல்:
   - Product Code note பண்ணி வையுங்கள்.
   - License key enter செய்து **Activate License** பண்ணவும்.

3) Admin login:
   - Username: admin
   - Password: admin123 (fresh DB).

   Settings section-ல்:
   - Company Name
   - Address
   - Contact Number
   போன்ற details enter செய்து save பண்ணவும்.


Step 7: Shortcut (optional) - Windows boot ஆனதும் auto start
-------------------------------------------------------------
Office computer-ல் Windows login ஆன உடனே app open ஆகணும்னா:

1) D:\chit fund\start_app.vbs மீது right-click → Create shortcut.
2) Run → shell:startup → Enter.
3) திறக்கும் Startup folder-க்குள் அந்த shortcut-ஐ paste பண்ணவும்.

இப்போ user Windows-க்கு login ஆனால்,
start_app.vbs auto run ஆகி app open ஆகும்.


குறிப்பு:
---------
- Requirements folder-ல இருக்கும் installers versions future-ல்
  update ஆகலாம். அந்த நேரத்தில் download_requirements.ps1 script-ஐ
  run பண்ணி புதிய installers download பண்ணலாம்.

- எதாவது error வந்தாலும்,
  Developer login → Developer Dashboard → Diagnostics / Installation Checklist
  section-ல் basic checks இருக்கிறது.

====================================================================
