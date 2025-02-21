import { Command, Child } from '@tauri-apps/plugin-shell';
import { platform } from '@tauri-apps/plugin-os';
import { TranscriptionCallbacks } from '@/types/interfaces';

let transcriptionProcess: Child | null = null;

export async function startTranscriptionServer(callbacks: TranscriptionCallbacks) {
    try {
        let command;
        const currentPlatform = platform();
        if (currentPlatform === 'windows') {
            command = Command.create('transcription-server-win');
        } else if (currentPlatform === 'macos') {
            command = Command.create('transcription-server-mac');
        } else {
            console.error("Unsupported platform:", currentPlatform);
            return;
        }

        command.on('close', data => {
            console.log(`Transcription server exited with code ${data.code} and signal ${data.signal}`);
        });

        command.on('error', error => {
            console.error(`Transcription server encountered an error: "${error}"`);
        });

        command.stdout.on('data', (line) => {
            handleStdOutLine(line, callbacks);
        });

        command.stderr.on('data', (line) => {
            handleStdErrLine(line, callbacks);
        });

        console.log('Starting transcription server...');
        transcriptionProcess = await command.spawn();
        console.log('Transcription server started with PID:', transcriptionProcess.pid);
    } catch (error) {
        console.error("Failed to start the transcription server:", error);
    }
}

export async function stopTranscriptionServer() {
    try {
        if (transcriptionProcess) {
            await transcriptionProcess.kill();
            console.log('Transcription server stopped');
        }
    } catch (error) {
        console.error('Error stopping transcription server:', error);
    }
}

function handleStdOutLine(
    line: string,
    callbacks: TranscriptionCallbacks
) {
    const subtitleRegex = /\[\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}\.\d{3}\]\s+(.*)/;
    const match = line.match(subtitleRegex);
    if (match && match[1]) {
        const result = match[1].replace(/"/g, '').trim();
        const subtitle = { text: result, start: "", end: "", speaker: "" };
        callbacks.setSubtitles(prev => [subtitle, ...prev]);
        callbacks.setProgress(90);
        callbacks.setMessage("Processing Subtitles...");
        callbacks.setIsLoading(true);
    } else if (line.includes('Progress:')) {
        const percentageMatch = line.match(/(\d+)%/);
        if (percentageMatch && percentageMatch[1]) {
            const percentage = parseInt(percentageMatch[1], 10);
            const base = 30;
            const progressOffset = callbacks.enabledSteps?.diarize ? (percentage / 100 * 30) : (percentage / 100 * 60);
            callbacks.setProgress(base + progressOffset);
            callbacks.setMessage(`Transcribing Audio... ${percentage}%`);
        }
    } else {
        console.log(`Transcription Server STDOUT: "${line}"`);
    }
}

function handleStdErrLine(
    line: string,
    callbacks: TranscriptionCallbacks
) {
    if (line.trim() === "") return;

    if (line.includes('Adjustment:') || line.includes('Aligning:')) {
        callbacks.setMessage("Adjusting Timing...");
    } else if (
        (line.includes('address already in use') ||
            line.includes('Uvicorn running') ||
            line.includes('one usage of each socket') ||
            line.includes("Failed to load Python shared library")) &&
        callbacks.serverLoadingRef?.current
    ) {
        callbacks.setMessage("");
        callbacks.setIsLoading(false);
        callbacks.serverLoadingRef.current = false;
    } else if (line.includes('INFO:') || line.includes('VAD') || line.includes('Adjustment')) {
        if (line.includes('speechbrain')) {
            callbacks.setMessage("Diarizing speakers...");
            callbacks.setCurrentStep && callbacks.setCurrentStep(3);
            callbacks.setProgress(60);
            callbacks.setIsLoading(true);
        } else {
            console.log(`Transcription Server INFO: "${line}"`);
        }
    } else if (line.includes("model.bin:") || line.includes("weights.safetensors:")) {
        const percentageMatch = line.match(/(\d+)%/);
        if (percentageMatch && percentageMatch[1]) {
            const percentage = parseInt(percentageMatch[1], 10);
            callbacks.setMessage(`Downloading Model... ${percentage}%`);
            callbacks.setCurrentStep && callbacks.setCurrentStep(2);
            callbacks.setProgress(20 + (percentage / 100 * 10));
        }
    } else if (line.includes("download")) {
        callbacks.setMessage("Downloading Model...");
    } else {
        console.error(`Transcription Server STDERR: "${line}"`);
    }
}