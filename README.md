# DictationLab — English Dictation Practice

A single-page web app for English listening and dictation practice.

## Features

- **Read first** — Load any English article and read it with clickable words
- **Instant definitions** — Click a word to see its English meaning (via Free Dictionary API)
- **Wordbook** — Save words locally in your browser
- **Sentence dictation** — Listen to one sentence at a time, type the original text
- **Flexible checking** — Advance when words match; capitalization and punctuation are ignored
- **Loop playback** — Each sentence repeats until you click Stop
- **Adjustable speed** — Control TTS playback rate (0.5× – 1.5×)

## How to Use

1. **Start a local server** (required for word lookup):
   - Double-click `serve.bat`, or run `python -m http.server 8765`
   - Open [http://localhost:8765](http://localhost:8765) in your browser
2. Paste an article or click **Load sample article**
3. Click **Start Reading** — click words to look up meanings and add to wordbook
4. Click **Start Dictation** — listen, type, and check each sentence
5. Press **Enter** to check your answer; after it's correct, press **Enter** again for the next sentence

> **Note:** Opening `index.html` directly (`file://`) blocks dictionary requests. Always use a local server.

## Notes

- Text-to-speech uses the browser's built-in Web Speech API; voice quality varies by browser/OS
- Word definitions require an internet connection and a local server (`serve.bat`)
- Your wordbook is stored in `localStorage` and persists across sessions

## Files

- `index.html` — Page structure
- `styles.css` — Styling
- `app.js` — Application logic
