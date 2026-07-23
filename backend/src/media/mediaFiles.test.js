import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { ReadableStream } from "node:stream/web";
import test from "node:test";

import { cleanupMediaTempFiles, downloadMediaToTempFile } from "./mediaFiles.js";

test("downloads media to a temp file and cleans it up", async () => {
  let requestOptions = null;
  const file = await downloadMediaToTempFile({
    mediaUrl: "https://media.example.com/video.mp4",
    headers: {
      Referer: "https://www.bilibili.com/",
      "User-Agent": "Recallo test",
      Authorization: "must-not-forward"
    },
    maxBytes: 100,
    fetchImpl: async (_url, options) => {
      requestOptions = options;
      return {
        ok: true,
        status: 200,
        headers: new Map([["content-type", "video/mp4"]]),
        arrayBuffer: async () => Buffer.from("fake-video")
      };
    }
  });

  assert.equal(file.contentType, "video/mp4");
  assert.equal(await readFile(file.path, "utf8"), "fake-video");
  assert.equal(requestOptions.headers.referer, "https://www.bilibili.com/");
  assert.equal(requestOptions.headers["user-agent"], "Recallo test");
  assert.equal(requestOptions.headers.authorization, undefined);
  await cleanupMediaTempFiles(file);
  assert.equal(existsSync(file.path), false);
});

test("rejects media larger than configured max bytes", async () => {
  await assert.rejects(
    () => downloadMediaToTempFile({
      mediaUrl: "https://media.example.com/video.mp4",
      maxBytes: 4,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: new Map([["content-type", "video/mp4"]]),
        arrayBuffer: async () => Buffer.from("too-large")
      })
    }),
    /视频文件过大/
  );
});

test("rejects oversized content-length before reading media body", async () => {
  let arrayBufferCalled = false;
  await assert.rejects(
    () => downloadMediaToTempFile({
      mediaUrl: "https://media.example.com/video.mp4",
      maxBytes: 4,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: new Map([
          ["content-type", "video/mp4"],
          ["content-length", "9"]
        ]),
        arrayBuffer: async () => {
          arrayBufferCalled = true;
          return Buffer.from("too-large");
        }
      })
    }),
    /视频文件过大/
  );
  assert.equal(arrayBufferCalled, false);
});

test("falls back to the next media CDN when the first candidate is unavailable", async () => {
  const calls = [];
  const file = await downloadMediaToTempFile({
    mediaUrls: [
      "https://slow.example.com/audio.m4a",
      "https://fast.example.com/audio.m4a"
    ],
    maxBytes: 100,
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes("slow.example.com")) {
        return {
          ok: false,
          status: 503,
          headers: new Map()
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Map([["content-type", "audio/mp4"]]),
        arrayBuffer: async () => Buffer.from("fallback-audio")
      };
    }
  });

  assert.deepEqual(calls, [
    "https://slow.example.com/audio.m4a",
    "https://fast.example.com/audio.m4a"
  ]);
  assert.equal(file.sourceUrl, "https://fast.example.com/audio.m4a");
  assert.equal(await readFile(file.path, "utf8"), "fallback-audio");
  await cleanupMediaTempFiles(file);
});

test("aborts streamed media when body exceeds max bytes without content-length", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(Buffer.from("too-"));
      controller.enqueue(Buffer.from("large"));
      controller.close();
    }
  });

  await assert.rejects(
    () => downloadMediaToTempFile({
      mediaUrl: "https://media.example.com/video.mp4",
      maxBytes: 4,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: new Map([["content-type", "video/mp4"]]),
        body
      })
    }),
    /视频文件过大/
  );
});
