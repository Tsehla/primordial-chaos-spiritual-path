require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const app = express();

const PUBLIC_DIR = path.join(__dirname, 'public');
const MEDIA_DIR = path.join(PUBLIC_DIR, 'media');
const UPLOAD_LOGS_DIR = path.join(__dirname, 'upload_logs');
const LOGS_FILE = path.join(__dirname, 'logs', 'logs.json');
const PASSWORD = process.env.FORM_PASSWORD || 'changeme';

// Ensure directories exist
[MEDIA_DIR, UPLOAD_LOGS_DIR, path.dirname(LOGS_FILE)].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MEDIA_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const unique = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
    cb(null, `${base}_${unique}${ext}`);
  }
});
const upload = multer({ storage });

// Helper: Get .html files in /public except index.html
function getHtmlFiles() {
  return fs.readdirSync(PUBLIC_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html');
}

// Helper: Append log to logs.json, keep max 1000
function appendLog(entry) {
  let logs = [];
  if (fs.existsSync(LOGS_FILE)) {
    try { logs = JSON.parse(fs.readFileSync(LOGS_FILE)); } catch {}
  }
  logs.push(entry);
  if (logs.length > 1000) logs = logs.slice(-1000);
  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
}

// Home: Show form
app.get('/', (req, res) => {
  const htmlFiles = getHtmlFiles();
  res.send(`
    <html>
    <head>
      <title>Ancient Spiritual path</title>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        body {
          background: #f7fafc;
          font-family: 'Segoe UI', Arial, sans-serif;
          color: #222;
          margin: 0;
          padding: 0;
        }
        .form-container {
          background: rgba(255,255,255,0.95);
          max-width: 480px;
          margin: 48px auto 0 auto;
          border-radius: 18px;
          box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.13), 0 2px 8px #0001;
          padding: 2.5rem 2rem 2rem 2rem;
        }
        h2 {
          text-align: center;
          color: #4fc3f7;
          margin-top: 0;
        }
        label {
          display: block;
          margin: 1.1em 0 0.3em 0;
          font-weight: 500;
        }
        input[type="text"], input[type="password"], select, textarea {
          width: 100%;
          padding: 0.6em;
          border-radius: 8px;
          border: 1px solid #cfd8dc;
          font-size: 1em;
          margin-bottom: 0.2em;
          background: #f9fbfc;
          box-sizing: border-box;
        }
        textarea {
          min-height: 80px;
        }
        input[type="file"] {
          margin-top: 0.3em;
        }
        button[type="submit"] {
          margin-top: 1.5em;
          width: 100%;
          padding: 0.8em;
          background: linear-gradient(90deg, #ffe066 0%, #4fc3f7 100%);
          color: #222;
          font-weight: bold;
          border: none;
          border-radius: 10px;
          font-size: 1.1em;
          box-shadow: 0 2px 8px #0001;
          cursor: pointer;
          transition: background 0.2s, transform 0.2s;
        }
        button[type="submit"]:hover {
          background: linear-gradient(90deg, #fffbea 0%, #4fc3f7 100%);
          transform: scale(1.03);
        }
        .note {
          color: #888;
          font-size: 0.95em;
          margin-bottom: 1em;
        }
        .quick-links {
          margin: 2em auto 0 auto;
          max-width: 480px;
          text-align: center;
        }
        .quick-links a {
          display: inline-block;
          margin: 0.3em 0.7em;
          color: #1976d2;
          text-decoration: none;
          font-weight: 500;
          background: #e3f2fd;
          padding: 0.3em 0.9em;
          border-radius: 7px;
          transition: background 0.2s;
        }
        .quick-links a:hover {
          background: #ffe066;
          color: #222;
        }
      </style>
    </head>
    <body>
      <div class="form-container">
        <h2>Ancient Spiritual path : Submit Content</h2>
        <form method="POST" enctype="multipart/form-data" action="/submit">
          <label>Heading:
            <input name="heading" type="text" maxlength="120" autocomplete="off" />
          </label>
          <label>Text:
            <textarea name="text" rows="5" cols="40" maxlength="2000"></textarea>
          </label>
          <label>Images: (multiple allowed)
            <input name="images" type="file" multiple accept="image/*">
          </label>
          <label>Files: (multiple allowed)
            <input name="files" type="file" multiple>
          </label>
          <label>Target HTML:
            <select name="target" required>
              ${htmlFiles.map(f => `<option value="${f}">${f}</option>`).join('')}
            </select>
          </label>
          <label>Insert at:
            <select name="position">
              <option value="top">Below &lt;h1&gt; (top)</option>
              <option value="bottom">End of section (bottom)</option>
            </select>
          </label>
          <label>Password:
            <input name="password" type="password" required autocomplete="off" />
          </label>
          <div class="note">All content (except summary) will be inside a single &lt;p&gt; in a &lt;details&gt; block.<br>
          Uploaded files will be linked and images shown above text.</div>
          <button type="submit">Save</button>
        </form>
      </div>
      <div class="quick-links">
        <b>Quick View:</b>
        ${htmlFiles.map(f => `<a href="/${f}" target="_blank">${f}</a>`).join('')}
      </div>
    </body>
    </html>
  `);
});

// Handle form submission
app.post('/submit', upload.fields([{ name: 'images' }, { name: 'files' }]), async (req, res) => {
  const { heading, text, target, position, password } = req.body;
  const images = (req.files['images'] || []).map(f => f.filename);
  const files = (req.files['files'] || []).map(f => f.filename);
  const timestamp = new Date().toLocaleString();

  // Password check
  if (!password || password !== PASSWORD) {
    appendLog({
      time: timestamp,
      action: 'submit',
      target,
      files: images.concat(files),
      error: 'Invalid password'
    });
    return res.status(401).send('<p style="color:red;">Invalid password.</p><a href="/">Back</a>');
  }

  // Compose <details> block with all content inside a single <p>
  let summary = heading && heading.trim() ? heading.trim() : (text || '').split(/\s+/).slice(0, 8).join(' ') + '...';

  let pContent = '';
  images.forEach(img => {
    pContent += `<img src="media/${img}" style="max-width:100%;display:block;margin:8px auto;">\n`;
  });
  pContent += `<span style="display:block;margin:8px 0;">${(text || '').replace(/\n/g, '<br>')}</span>\n`;
  if (files.length) {
    pContent += `<span>Files:<ul style="margin:4px 0 0 16px;">`;
    files.forEach(f => {
      pContent += `<li><a href="media/${f}" target="_blank">${f}</a></li>`;
    });
    pContent += `</ul></span>\n`;
  }
  pContent += `<span style="font-size:0.9em;color:#888;margin-top:8px;display:block;">${timestamp}</span>\n`;

  let details = `<details>\n<summary>${summary}</summary>\n<p>\n${pContent}</p>\n</details>\n`;

  // Edit target HTML: insert inside <section> below <h1> and <p> below h1 if at top, else at end
  const targetPath = path.join(PUBLIC_DIR, target);
  let html = '';
  let error = null;
  try {
    html = fs.readFileSync(targetPath, 'utf8');
    // Find <section>...</section>
    const sectionRegex = /<section([^>]*)>([\s\S]*?)<\/section>/i;
    const match = html.match(sectionRegex);
    if (match) {
      let sectionAttrs = match[1];
      let sectionContent = match[2];
      if (position === 'top') {
        // Find <h1>...</h1> and optional <p> immediately after
        const h1pRegex = /(<h1[^>]*>[\s\S]*?<\/h1>\s*(<p[^>]*>[\s\S]*?<\/p>\s*)?)/i;
        if (h1pRegex.test(sectionContent)) {
          sectionContent = sectionContent.replace(h1pRegex, (m) => m + details);
        } else {
          sectionContent = details + sectionContent;
        }
      } else {
        sectionContent = sectionContent + details;
      }
      html = html.replace(sectionRegex, `<section${sectionAttrs}>${sectionContent}</section>`);
    } else {
      // fallback: just add to body as before
      html = html.replace(/<\/body>/i, match => {
        if (position === 'top') {
          return details + match;
        } else {
          return match.replace(/^/, details);
        }
      });
    }
    fs.writeFileSync(targetPath, html, 'utf8');
  } catch (e) {
    error = e.message;
  }

  // Save upload log
  const logObj = {
    heading, text, images, files, target, position, timestamp
  };
  try {
    fs.writeFileSync(
      path.join(UPLOAD_LOGS_DIR, `${target}.json`),
      JSON.stringify(logObj, null, 2)
    );
  } catch {}

  // Save process log
  appendLog({
    time: timestamp,
    action: 'submit',
    target,
    files: images.concat(files),
    error: error || null
  });

  // Git push if no error
  let gitMsg = '';
  if (!error) {
    exec('git add . && git commit -m "Auto: content update" && git push', { cwd: __dirname }, (err, stdout, stderr) => {
      // Optionally log git output/errors
    });
    gitMsg = `<div style="color:green;margin-top:1em;">Git push triggered.</div>`;
  }

  if (error) {
    res.status(500).send('Error: ' + error + '<br><a href="/">Back</a>');
  } else {
    // Quick links to view html
    const htmlLinks = `<div style="margin-top:1.5em;"><b>View:</b> <a href="/${target}" target="_blank">${target}</a> &nbsp; <a href="/">Back</a></div>`;
    res.send(`<p>Saved to <b>${target}</b>!</p>${gitMsg}${htmlLinks}`);
  }
});

// Serve static files
app.use('/media', express.static(MEDIA_DIR));
app.use(express.static(PUBLIC_DIR));

// Start server
const PORT = process.env.PORT || 8082;
app.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
});