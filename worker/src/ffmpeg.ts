import { spawn } from "node:child_process";
import { parseProbe, stderrTail, type ProbeResult } from "./hls";

// Runs the ffmpeg / ffprobe programs (installed in the Docker image) as child processes.
// Node isn't doing the video work itself: it starts FFmpeg, waits for it to exit, and
// reads its output. While FFmpeg runs, Node stays free (e.g. to keep the BullMQ job
// lock alive, which tells the queue "this worker is still alive and busy").

type RunResult = { stdout: string; stderr: string };

function run(command: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    // FFmpeg writes its progress and errors to stderr. Keep only the last 20 KB:
    // enough for the error message, without growing forever on long videos.
    child.stderr.on("data", (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-20_000)));
    child.on("error", (err) => reject(new Error(`Couldn't start ${command}: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with code ${code}:\n${stderrTail(stderr)}`));
    });
  });
}

/** Ask ffprobe for the duration and whether there's an audio track. */
export async function probe(input: string): Promise<ProbeResult> {
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", input]);
    return parseProbe(stdout);
  } catch (err) {
    // Lead with a plain sentence (shown in the UI); keep FFmpeg's details after it.
    throw new Error(`This file couldn't be read as a video. ${(err as Error).message}`);
  }
}

export async function ffmpeg(args: string[]): Promise<void> {
  await run("ffmpeg", args);
}
