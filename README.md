# Meme Museum

A beginner-friendly, full-stack meme sharing website. It uses **Node.js only**; you do not need to install any packages or database software. Information is saved in `data/db.json`, and uploaded images go in `uploads/`.

## Run it on Windows

1. Install Node.js from [nodejs.org](https://nodejs.org/) if `node -v` does not show a version number.
2. Extract the ZIP file. Open the extracted `meme-museum` folder in Visual Studio Code.
3. In VS Code, choose **Terminal → New Terminal**.
4. Run `node -v`. If you see a version, continue. (No `npm install` is needed.)
5. Run `npm start`.
6. Open **http://localhost:3000** in your browser.
7. To stop the server, return to the terminal and press **Ctrl+C**.

## Features

- Home page with trending and most-liked sections
- Search and category filters
- Meme details, likes, 1–5 star ratings, and comments
- Register and log in
- Upload an image with caption and category
- Report a meme
- Contact page
- Persistent JSON data in `data/db.json`

## Important notes

- Create an account to upload, like, rate, comment, or report. You can register with any name, email, and password for local practice.
- This is a learning/demo project. It is not ready for public hosting: it has no production-grade session management, moderation dashboard, email verification, or cloud image storage.
- Keep `data/db.json` and `uploads/` in the project folder. They hold the saved data and images.
- To reset the sample project, stop the server and delete `data/db.json`. It will be recreated with sample memes next time you start the server. Uploaded image files are not automatically removed.

## Main files

- `server.js` — the Node.js backend and API
- `public/index.html` — all four pages and the visible website
- `public/styles.css` — layout, colors, and responsive design
- `public/app.js` — browser actions and API calls
- `data/db.json` — created automatically to store users, memes, likes, ratings, comments, and reports
- `uploads/` — uploaded meme images
