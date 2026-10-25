# Smart Road Management System

## Setup
1. `modules.css`, `home.css` and `modules.js` are included. If you already have your own versions, keep yours and do not copy these.
2. Install dependencies and start the backend:
   - **Windows PowerShell:** `cd .\backend`, then run `npm.cmd install` and `npm.cmd start`. Using `npm.cmd` avoids PowerShell execution-policy errors when `npm` resolves to `npm.ps1`.
   - **Command Prompt or macOS/Linux:** `cd backend && npm install && npm start`
3. Open http://localhost:3000 (the server also serves the frontend).

Set an admin key before real use (default is `change-me`):
- **Windows PowerShell:** `$env:ADMIN_KEY = 'your-secret'; npm.cmd start`
- **Command Prompt:** `set ADMIN_KEY=your-secret && npm start`
- **macOS/Linux:** `ADMIN_KEY=your-secret npm start`

## API
| Method | Endpoint | Access |
|---|---|---|
| POST / GET | /api/accidents | public (list hides phone and description) |
| PATCH | /api/accidents/ACC-00001/status | admin |
| POST | /api/complaints | public |
| GET | /api/complaints/track/CMP-00001 | public (status only) |
| GET / PATCH | /api/complaints, /api/complaints/CMP-00001/status | admin |
| POST / GET | /api/feedback | POST public, GET admin |
| GET | /api/emergency | public |
| POST / GET | /api/contact | POST public, GET admin |
| POST / GET | /api/road-issues | public |

Admin calls need the header `x-admin-key: <your key>`.
