import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';

const videoPath = 'C:\\Users\\Levie Anne\\OneDrive\\Documents\\Levay\\New Work 2026 - Part Time\\Payroll User Stories\\Final versions\\v7\\aug 8 2026\\Atlas _ Demo for Computational Basis-20260724_133621-Meeting Recording.mp4';
const size = statSync(videoPath).size;

http.createServer((request, response) => {
  const range = request.headers.range;
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Type', 'video/mp4');
  if (!range) {
    response.writeHead(200, { 'Content-Length': size });
    createReadStream(videoPath).pipe(response);
    return;
  }
  const [startText, endText] = range.replace('bytes=', '').split('-');
  const start = Number(startText);
  const end = endText ? Number(endText) : Math.min(start + 1024 * 1024 - 1, size - 1);
  response.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${size}`,
    'Content-Length': end - start + 1,
  });
  createReadStream(videoPath, { start, end }).pipe(response);
}).listen(4182, '127.0.0.1');
