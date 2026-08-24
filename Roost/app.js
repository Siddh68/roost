// Entry point for Hostinger's cPanel "Setup Node.js App" (Passenger).
// Passenger runs `node app.js` from the Application Root and sets PORT —
// this boots the pre-built Next.js app (packages/web) as a plain HTTP
// server instead of relying on the `next start` CLI binary, which Passenger
// can't invoke directly.

// Polyfill ES2023 change-array-by-copy methods (toSorted/toReversed/toSpliced/with)
// for Node 18, which lacks them — Next.js 16's internal config loader calls
// .toSorted() unconditionally and crashes on startup without this. Only
// installed if genuinely missing, so this is a no-op on Node 20+.
if (!Array.prototype.toSorted) {
  Array.prototype.toSorted = function (compareFn) {
    return [...this].sort(compareFn);
  };
}
if (!Array.prototype.toReversed) {
  Array.prototype.toReversed = function () {
    return [...this].reverse();
  };
}
if (!Array.prototype.toSpliced) {
  Array.prototype.toSpliced = function (...args) {
    const copy = [...this];
    copy.splice(...args);
    return copy;
  };
}
if (!Array.prototype.with) {
  Array.prototype.with = function (index, value) {
    const copy = [...this];
    copy[index < 0 ? copy.length + index : index] = value;
    return copy;
  };
}

const path = require("path");
const http = require("http");
const next = require("next");

const port = process.env.PORT || 3000;
const app = next({ dev: false, dir: path.join(__dirname, "packages", "web") });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    http
      .createServer((req, res) => handle(req, res))
      .listen(port, () => {
        console.log(`Roost listening on port ${port}`);
      });
  })
  .catch((err) => {
    console.error("Failed to start Roost:", err);
    process.exit(1);
  });
